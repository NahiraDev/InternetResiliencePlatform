import { describe, expect, it } from 'vitest';
import { ResilienceRuntime, explainDecision } from '../src/index.js';
import { createCapabilitySnapshot } from '../src/context/context.js';

const liveContext = () => ({
  securityContext: { trusted: true },
  capabilitySnapshot: createCapabilitySnapshot([], true),
  policySnapshot: {
    id: 'explain-policy',
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

describe('decision explanation coverage (issue #280)', () => {
  it('projects rejected alternatives, objective scoring and guards', async () => {
    const runtime = new ResilienceRuntime([], { runtimeId: 'explain' });
    const record = await runtime.runCycle({
      mode: 'live',
      correlationId: 'explain/live',
      idempotencyKey: 'explain/live',
      ...liveContext(),
    });

    const explanation = explainDecision(record);

    // Why this was chosen.
    expect(explanation.selection.selected).toBe('noop');
    expect(typeof explanation.selection.expectedBenefit).toBe('number');
    expect(typeof explanation.selection.risk).toBe('number');
    expect(explanation.selection.objectiveScore).not.toBeNull();
    expect(explanation.selection.objectives).not.toBeNull();

    // Which alternatives were rejected, and why.
    expect(Array.isArray(explanation.selection.alternatives)).toBe(true);

    // Which guards applied.
    expect(explanation.guards.validationValid).not.toBeNull();
    expect(Array.isArray(explanation.guards.validationReasons)).toBe(true);

    // What verification concluded.
    expect(explanation.verification).not.toBeNull();
    expect(explanation.verification?.status).toBeDefined();
    expect(Array.isArray(explanation.verification?.verifiedPostconditions)).toBe(true);
    expect(Array.isArray(explanation.verification?.failedPostconditions)).toBe(true);
  });

  it('retains the existing explainability contract', async () => {
    const runtime = new ResilienceRuntime([], { runtimeId: 'explain-2' });
    const record = await runtime.runCycle({
      mode: 'live',
      correlationId: 'explain/contract',
      idempotencyKey: 'explain/contract',
      ...liveContext(),
    });
    const explanation = explainDecision(record);

    expect(explanation.decisionId).toBe(record.decisionId);
    expect(explanation.intent).toBe('noop');
    expect(['healthy', 'attention']).toContain(explanation.health);
    expect(['clear', 'failing-closed']).toContain(explanation.securityPosture);
    expect(Array.isArray(explanation.constraints.policyReasons)).toBe(true);
    expect(Array.isArray(explanation.failureDomain)).toBe(true);
    expect(typeof explanation.recoveryState).toBe('string');
    expect(Object.isFrozen(explanation)).toBe(true);
    expect(Object.isFrozen(explanation.selection)).toBe(true);
  });

  it('reports a denial as unhealthy with the rejection reasons visible', async () => {
    const runtime = new ResilienceRuntime([], { runtimeId: 'explain-denied' });
    const record = await runtime.runCycle({
      mode: 'live',
      correlationId: 'explain/denied',
      idempotencyKey: 'explain/denied',
      securityContext: { trusted: false },
      capabilitySnapshot: createCapabilitySnapshot([], false),
    });

    const explanation = explainDecision(record);
    expect(explanation.health).toBe('attention');
    expect(explanation.constraints.policyReasons.length).toBeGreaterThan(0);
    // The cycle is refused at the planner's policy gate, so validation is never
    // reached. `null` distinguishes "not evaluated" from "evaluated and false",
    // which `false` alone would hide.
    expect(explanation.guards.validationValid).toBeNull();
    expect(explanation.verification).toBeNull();
  });
});