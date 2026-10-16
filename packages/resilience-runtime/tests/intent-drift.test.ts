import { describe, it, expect } from 'vitest';
import { detectIntentDrift } from '../src/intent/drift.js';
import type { CompiledIntent } from '../src/domain/types.js';

const baseIntent = (overrides: Partial<CompiledIntent> = {}): CompiledIntent =>
  ({
    intentId: 'intent-1',
    version: 1,
    priority: 'normal',
    desiredOutcome: 'stable connectivity',
    target: {},
    constraints: {},
    objectives: { score: 0.95 },
    confidence: 0.9,
    provenance: 'test',
    autonomy: 'OBSERVE_ONLY',
    scope: {},
    effectiveFrom: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    compiledAt: new Date().toISOString(),
    ...overrides,
  }) as CompiledIntent;

describe('detectIntentDrift', () => {
  it('classifies expired intents as not effective and recommends DENY', () => {
    const intent = baseIntent({
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    const result = detectIntentDrift(intent, { score: 1 });
    expect(result.effective).toBe(false);
    expect(result.recommendedAdmission).toBe('DENY');
    expect(result.reasons.some((r) => r.includes('effective'))).toBe(true);
  });

  it('reports high drift when observed score is substantially below objective', () => {
    const intent = baseIntent();
    const result = detectIntentDrift(intent, { score: 0.5 });
    expect(result.effective).toBe(true);
    expect(result.severity).toBe('high');
    expect(result.recommendedAdmission).toBe('OBSERVE_ONLY');
    expect(result.observedDelta.score).toEqual({ target: 0.95, observed: 0.5 });
  });

  it('reports no drift for healthy observations', () => {
    const intent = baseIntent();
    const result = detectIntentDrift(intent, { score: 0.98 });
    expect(result.severity).toBe('none');
    expect(result.recommendedAdmission).toBe('ALLOW');
    expect(Object.keys(result.observedDelta)).toHaveLength(0);
  });
});
