import { describe, expect, it } from 'vitest';
import { ResilienceRuntime } from '../src/runtime.js';
import { createCapabilitySnapshot } from '../src/context/context.js';
import type { OutcomeProbe } from '../src/verification/outcome-verification.js';
import { KnowledgeStore } from '../src/knowledge/knowledge-store.js';
import { OutcomeLearningLoop } from '../src/learning/outcome-learning-loop.js';

const liveContext = (): Record<string, unknown> => ({
  securityContext: { trusted: true },
  capabilitySnapshot: createCapabilitySnapshot([], true),
  policySnapshot: {
    id: 'learning-policy',
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    source: 'test',
    metadata: {},
    policy: {
      allowedActions: ['noop'],
      deniedActions: [],
      capabilityRequirements: {},
      securityConstraints: ['trusted-context'],
      actionBudget: 1,
      maxConcurrentActions: 1,
      confidenceThreshold: 0,
      telemetryFreshnessMs: 60_000,
      simulationOnly: false,
      failClosed: true,
    },
  },
});

const runLive = async (runtime: ResilienceRuntime, correlationId: string) =>
  runtime.runCycle({
    mode: 'live',
    correlationId,
    idempotencyKey: correlationId,
    ...liveContext(),
  });

const reachableProbe = (subjectId: string): OutcomeProbe => ({
  scope: 'destination',
  subjectId,
  probe: async () => ({ reachable: true, latencyMs: 12 }),
});

const unreachableProbe = (subjectId: string): OutcomeProbe => ({
  scope: 'destination',
  subjectId,
  probe: async () => {
    throw new Error('destination refused the connection');
  },
});

describe('runtime learning closure (issue #279)', () => {
  it('records unverified evidence and leaves selection unchanged when no real probe ran', async () => {
    const knowledgeStore = new KnowledgeStore();
    const runtime = new ResilienceRuntime([], {
      runtimeId: 'learning-none',
      knowledgeStore,
    });

    const record = await runLive(runtime, 'learning/no-probe');

    expect(record.outcome).not.toBe('blocked');
    const evidence = runtime.learningLoop.evidence();
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.verified).toBe(false);
    expect(evidence[0]?.summary).toContain('unverified outcome');
    // The unverified outcome is never recorded as knowledge, so it cannot
    // reinforce a strategy.
    expect(knowledgeStore.size()).toBe(0);
  });

  it('learns only from a real destination probe that actually succeeded', async () => {
    const knowledgeStore = new KnowledgeStore();
    const runtime = new ResilienceRuntime([], {
      runtimeId: 'learning-verified',
      knowledgeStore,
      outcomeProbes: [reachableProbe('api.example.test')],
    });

    await runLive(runtime, 'learning/verified');

    const evidence = runtime.learningLoop.evidence();
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.verified).toBe(true);
    expect(evidence[0]?.summary).toContain('1/1 probe(s) reachable');

    const outcomeEvents = runtime.events.events.filter(
      ({ event }) => event === 'runtime.outcome.verified',
    );
    expect(outcomeEvents).toHaveLength(1);
    expect(outcomeEvents[0]?.payload.outcomeVerified).toBe(true);
  });

  it('does not learn from a probe that fails, and keeps the cycle non-fatal', async () => {
    const runtime = new ResilienceRuntime([], {
      runtimeId: 'learning-failed-probe',
      outcomeProbes: [unreachableProbe('api.example.test')],
    });

    const record = await runLive(runtime, 'learning/failed-probe');

    // A probe failure must not throw out of the cycle.
    expect(record).toBeDefined();
    const evidence = runtime.learningLoop.evidence();
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.verified).toBe(false);
    const outcomeEvents = runtime.events.events.filter(
      ({ event }) => event === 'runtime.outcome.verified',
    );
    expect(outcomeEvents[0]?.payload.outcomeVerified).toBe(false);
  });

  it('survives a throwing probe without failing the control cycle', async () => {
    const runtime = new ResilienceRuntime([], {
      runtimeId: 'learning-throwing-probe',
      outcomeProbes: [
        {
          scope: 'service',
          subjectId: 'svc',
          probe: async () => {
            throw new Error('probe transport exploded');
          },
        },
      ],
    });

    await expect(runLive(runtime, 'learning/throwing-probe')).resolves.toBeDefined();
    expect(runtime.learningLoop.evidence()).toHaveLength(1);
  });

  it('accepts an injected canonical learning loop and uses it', async () => {
    const loop = new OutcomeLearningLoop();
    const runtime = new ResilienceRuntime([], {
      runtimeId: 'learning-injected',
      learningLoop: loop,
      outcomeProbes: [reachableProbe('api.example.test')],
    });

    await runLive(runtime, 'learning/injected');

    expect(runtime.learningLoop).toBe(loop);
    expect(loop.evidence()).toHaveLength(1);
    expect(loop.evidence()[0]?.verified).toBe(true);
  });

  it('emits taxonomy-conformant outcome evidence with transaction identity', async () => {
    const { validateEvent } = await import('../src/events/event-taxonomy.js');
    const runtime = new ResilienceRuntime([], {
      runtimeId: 'learning-taxonomy',
      outcomeProbes: [reachableProbe('api.example.test')],
    });

    await runLive(runtime, 'learning/taxonomy');

    const invalid = runtime.events
      .events.filter(({ event }) => event.startsWith('runtime.outcome') || event.startsWith('runtime.learning'))
      .filter(({ event, payload }) => !validateEvent(event, payload).valid);
    expect(invalid).toEqual([]);
    expect(runtime.events.invalidCount()).toBe(0);
  });
});