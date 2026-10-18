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
    objectives: { reachability: 0.95 },
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
    const result = detectIntentDrift(intent, { reachability: 1 });
    expect(result.effective).toBe(false);
    expect(result.recommendedAdmission).toBe('DENY');
    expect(result.reasons.some((r) => r.includes('effective'))).toBe(true);
  });

  it('reports high drift when higher-is-better objective is substantially below target', () => {
    const intent = baseIntent({ objectives: { reachability: 0.95 } });
    const result = detectIntentDrift(intent, { reachability: 0.5 });
    expect(result.effective).toBe(true);
    expect(result.severity).toBe('high');
    expect(result.recommendedAdmission).toBe('OBSERVE_ONLY');
    expect(result.observedDelta.reachability).toMatchObject({ target: 0.95, observed: 0.5 });
  });

  it('reports high drift when lower-is-better objective is substantially above target', () => {
    const intent = baseIntent({ objectives: { latency: 50 } });
    const result = detectIntentDrift(intent, { latency: 200 });
    expect(result.severity).toBe('high');
    expect(result.recommendedAdmission).toBe('OBSERVE_ONLY');
    expect(result.observedDelta.latency).toMatchObject({ target: 50, observed: 200 });
  });

  it('reports no drift for healthy observations on both directions', () => {
    const intent = baseIntent({ objectives: { reachability: 0.95, latency: 50 } });
    const result = detectIntentDrift(intent, { reachability: 0.97, latency: 48 });
    expect(result.severity).toBe('none');
    expect(result.recommendedAdmission).toBe('ALLOW');
    expect(Object.keys(result.observedDelta)).toHaveLength(0);
  });


  it('classifies substantial unknown-objective deviation symmetrically', () => {
    const intent = baseIntent({ objectives: { score: 0.95 } });
    const result = detectIntentDrift(intent, { score: 0.5 });
    expect(result.severity).toBe('high');
    expect(result.recommendedAdmission).toBe('OBSERVE_ONLY');
    expect(result.observedDelta.score).toMatchObject({ target: 0.95, observed: 0.5 });
  });

  it('does not assume unknown objectives are lower-is-better when observations are higher', () => {
    const intent = baseIntent({ objectives: { score: 0.5 } });
    const result = detectIntentDrift(intent, { score: 0.95 });
    expect(result.severity).toBe('high');
    expect(result.recommendedAdmission).toBe('OBSERVE_ONLY');
  });

  it('does not false-positive when latency is below target (better)', () => {
    const intent = baseIntent({ objectives: { latency: 100 } });
    const result = detectIntentDrift(intent, { latency: 40 });
    expect(result.severity).toBe('none');
    expect(result.recommendedAdmission).toBe('ALLOW');
  });

  it('treats zero target with non-zero observation as material drift for unknown objectives', () => {
    const intent = baseIntent({ objectives: { score: 0 } });
    const result = detectIntentDrift(intent, { score: 1 });
    expect(result.severity).toBe('high');
    expect(result.recommendedAdmission).toBe('OBSERVE_ONLY');
  });

  it('selects the highest severity across multiple objectives', () => {
    const intent = baseIntent({ objectives: { reachability: 0.95, latency: 50 } });
    const result = detectIntentDrift(intent, { reachability: 0.85, latency: 200 });
    expect(result.severity).toBe('high');
    expect(result.observedDelta).toHaveProperty('reachability');
    expect(result.observedDelta).toHaveProperty('latency');
    expect(result.recommendedAdmission).toBe('OBSERVE_ONLY');
  });
});
