import { describe, expect, it } from 'vitest';
import { createCanonicalRuntime } from '../src/canonical-runtime-composition.js';
import { KnowledgeStore } from '../src/knowledge/knowledge-store.js';
import { OutcomeLearningLoop } from '../src/learning/outcome-learning-loop.js';

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

  it('keeps the composition frozen so hosts cannot swap the authority', () => {
    const composition = createCanonicalRuntime({ executionMode: 'simulation' });
    expect(Object.isFrozen(composition)).toBe(true);
  });
});