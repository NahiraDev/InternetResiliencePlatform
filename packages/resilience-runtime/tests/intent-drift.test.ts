import { describe, expect, it } from 'vitest';
import type { CompiledIntent } from '../src/domain/types.js';
import { detectIntentDrift } from '../src/intent/drift.js';
import { isCompiledIntentEffective } from '../src/intent/compiler.js';

const baseIntent = (overrides: Partial<CompiledIntent> = {}): CompiledIntent => ({
  intentId: 'intent-test-1',
  version: 1,
  priority: 'normal',
  desiredOutcome: 'low latency reachability',
  target: {},
  constraints: {},
  objectives: { latency: 0.8, reachability: 0.9 },
  confidence: 0.85,
  provenance: 'test',
  autonomy: 'SAFE_AUTOMATION',
  scope: {},
  compiledAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

describe('Phase 85 intent drift detection', () => {
  it('classifies effective vs expired intents', () => {
    const now = new Date('2026-10-16T00:00:00.000Z');
    const active = baseIntent({
      effectiveFrom: '2026-10-01T00:00:00.000Z',
      expiresAt: '2026-11-01T00:00:00.000Z',
    });
    const expired = baseIntent({
      effectiveFrom: '2026-09-01T00:00:00.000Z',
      expiresAt: '2026-10-01T00:00:00.000Z',
    });

    expect(isCompiledIntentEffective(active, now)).toBe(true);
    expect(isCompiledIntentEffective(expired, now)).toBe(false);

    const expiredSignal = detectIntentDrift(expired, { latencyMs: 50 }, now);
    expect(expiredSignal.effective).toBe(false);
    expect(expiredSignal.recommendedAdmission).toBe('DENY');
    expect(expiredSignal.severity).toBe('none');
  });

  it('returns structured drift signal with severity and recommended admission', () => {
    const intent = baseIntent();
    const highDrift = detectIntentDrift(intent, {
      latencyMs: 400,
      packetLoss: 0.15,
      reachability: 0.4,
    });

    expect(highDrift.intentId).toBe('intent-test-1');
    expect(highDrift.effective).toBe(true);
    expect(highDrift.severity).toBe('high');
    expect(highDrift.recommendedAdmission).toBe('REQUIRE_APPROVAL');
    expect(highDrift.observedDelta.latencyMs).toBeGreaterThan(0);
    expect(highDrift.reasons.length).toBeGreaterThan(0);
    expect(highDrift.reasons.some((r) => r.includes('latency'))).toBe(true);
  });

  it('reports no significant drift for healthy observations', () => {
    const intent = baseIntent();
    const healthy = detectIntentDrift(intent, {
      latencyMs: 40,
      packetLoss: 0.01,
      reachability: 0.98,
    });

    expect(healthy.severity).toBe('none');
    expect(healthy.recommendedAdmission).toBe('ALLOW');
    expect(Object.keys(healthy.observedDelta)).toHaveLength(0);
    expect(healthy.reasons[0]).toMatch(/no significant drift/);
  });

  it('never returns a mutation-capable result; signal is observational', () => {
    const intent = baseIntent();
    const signal = detectIntentDrift(intent, { latencyMs: 200 });
    // Type-level and structural guarantee: no execute/apply fields exist
    expect(signal).not.toHaveProperty('execute');
    expect(signal).not.toHaveProperty('apply');
    expect(signal).not.toHaveProperty('mutate');
    expect(typeof signal.recommendedAdmission).toBe('string');
  });
});
