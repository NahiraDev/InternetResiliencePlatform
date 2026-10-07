import { describe, expect, it } from 'vitest';
import { createCanonicalRuntime } from '../src/canonical-runtime-composition.js';
import {
  createCapabilitySnapshot,
  createPolicySnapshot,
  defaultPolicy,
} from '../src/index.js';
import { KnowledgeStore } from '../src/knowledge/knowledge-store.js';
import { OutcomeLearningLoop } from '../src/learning/outcome-learning-loop.js';
import type { CandidateAction, CompiledIntent, DecisionProvider } from '../src/index.js';

describe('#276/#279 canonical composition', () => {
  it('exposes a knowledge boundary', () => {
    const composition = createCanonicalRuntime({ executionMode: 'simulation' });
    expect(composition.knowledgeStore).toBeInstanceOf(KnowledgeStore);
  });

  it('exposes a learning loop', () => {
    const composition = createCanonicalRuntime({ executionMode: 'simulation' });
    expect(composition.learningLoop).toBeInstanceOf(OutcomeLearningLoop);
  });

  it('defaults the learning loop to the canonical knowledge store', () => {
    const composition = createCanonicalRuntime({ executionMode: 'simulation' });
    // The loop learns from the same boundary it is composed with, so a record
    // written to the store is visible to decay on the next learning step.
    composition.knowledgeStore.record({
      kind: 'measurement',
      source: 'measurement',
      provenance: { producer: 'p', source: 'measurement' },
      observedAt: new Date().toISOString(),
      confidence: 0.9,
      halfLifeMs: 1000,
      correlationId: 'c',
      objectiveEvidence: { latency: 0.5 },
    });
    expect(composition.knowledgeStore.size()).toBe(1);
    expect(composition.learningLoop.snapshot().evidenceCount).toBe(0);
  });

  it('accepts an injected knowledge store rather than creating a second one', () => {
    const injected = new KnowledgeStore();
    const composition = createCanonicalRuntime({
      executionMode: 'simulation',
      knowledgeStore: injected,
    });
    expect(composition.knowledgeStore).toBe(injected);
  });

  it('accepts an injected learning loop', () => {
    const injected = new OutcomeLearningLoop();
    const composition = createCanonicalRuntime({
      executionMode: 'simulation',
      learningLoop: injected,
    });
    expect(composition.learningLoop).toBe(injected);
  });

  it('gives each composition its own boundary by default', () => {
    const a = createCanonicalRuntime({ executionMode: 'simulation' });
    const b = createCanonicalRuntime({ executionMode: 'simulation' });
    expect(a.knowledgeStore).not.toBe(b.knowledgeStore);
    expect(a.learningLoop).not.toBe(b.learningLoop);
  });

  it('uses the same knowledge boundary inside the composed runtime', () => {
    const composition = createCanonicalRuntime({ executionMode: 'simulation' });
    expect(composition.runtime.knowledgeStore).toBe(composition.knowledgeStore);
  });

  it('routes compositional knowledge into canonical planning decisions', async () => {
    const now = new Date().toISOString();
    const knowledgeCandidate = (
      id: string,
      risk: number,
      pathId: string,
    ): CandidateAction => ({
      id,
      schemaVersion: 1,
      createdAt: now,
      correlationId: 'composition-knowledge',
      source: 'test',
      metadata: { destination: 'composition.example', pathId },
      intent: 'connectivity_failover',
      expectedBenefit: 0.8,
      risk,
      confidence: 0.8,
      requiredCapabilities: [],
      dependencies: [],
      postconditions: ['destination reachable'],
      verificationRequirements: ['destination outcome'],
      rejectionReasons: [],
    });
    const incumbent = knowledgeCandidate('composition-incumbent', 0.2, 'composition-bad-path');
    const alternative = knowledgeCandidate('composition-alternate', 0.7, 'composition-good-path');
    const intentionalDecisionProvider: DecisionProvider = {
      async decide() {
        return [incumbent, alternative];
      },
    };
    const compiledIntent: CompiledIntent = {
      intentId: 'composition-latency',
      version: 1,
      priority: 'high',
      desiredOutcome: 'minimize latency',
      target: { destination: 'composition.example' },
      constraints: {},
      objectives: { latency: 1 },
      confidence: 0.9,
      provenance: 'test',
      autonomy: 'AUTONOMOUS',
      scope: {},
      compiledAt: now,
    };
    const knowledgeStore = new KnowledgeStore();
    const composition = createCanonicalRuntime({
      executionMode: 'simulation',
      decisionProvider: intentionalDecisionProvider,
      knowledgeStore,
    });
    const cycleInput = {
      securityContext: { trusted: true },
      capabilitySnapshot: createCapabilitySnapshot([], true),
      policySnapshot: createPolicySnapshot({
        ...defaultPolicy('simulation'),
        allowedActions: ['connectivity_failover'],
        actionBudget: 10,
        maxConcurrentActions: 5,
        confidenceThreshold: 0.1,
      }),
      compiledIntent,
      compiledIntents: [compiledIntent],
    };

    const baseline = await composition.runCycle(cycleInput);
    expect(baseline.selectedPlan?.selectedAction.id).toBe('composition-incumbent');

    for (const [pathId, latency] of [
      ['composition-bad-path', 0.05],
      ['composition-good-path', 0.95],
    ] as const) {
      knowledgeStore.record({
        kind: 'measurement',
        source: 'measurement',
        provenance: { producer: 'composition-test', source: 'measurement' },
        scope: { destination: 'composition.example', pathId },
        observedAt: new Date().toISOString(),
        confidence: 1,
        correlationId: 'composition-knowledge',
        objectiveEvidence: { latency },
      });
    }

    const informed = await composition.runCycle(cycleInput);
    expect(informed.selectedPlan?.selectedAction.id).toBe('composition-alternate');
  });

  it('keeps the composition frozen so hosts cannot swap the authority', () => {
    const composition = createCanonicalRuntime({ executionMode: 'simulation' });
    expect(Object.isFrozen(composition)).toBe(true);
  });
});