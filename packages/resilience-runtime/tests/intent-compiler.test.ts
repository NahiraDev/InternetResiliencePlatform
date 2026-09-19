import { describe, expect, it } from 'vitest';
import { compileNetworkIntent } from '../src/intent/compiler.js';
import { createNetworkIntent } from '@irp/core';

const activeIntent = (overrides: Record<string, unknown> = {}) =>
  createNetworkIntent({
    id: 'intent-github',
    priority: 'high',
    spec: {
      outcome: 'Maintain stable low-latency access to GitHub',
      target: { destination: 'github.com' },
      constraints: { 'objective.latency': 0.9, maxLatencyMs: 150 },
    },
    ...overrides,
  });

describe('compileNetworkIntent', () => {
  it('turns an active declarative intent into normalized runtime objectives', () => {
    const intent = { ...activeIntent(), status: 'active' as const };
    const compiled = compileNetworkIntent(intent);

    expect(compiled).toMatchObject({
      intentId: 'intent-github',
      desiredOutcome: 'Maintain stable low-latency access to GitHub',
      target: { destination: 'github.com' },
      constraints: { maxLatencyMs: 150 },
      provenance: 'network-intent',
      autonomy: 'ADVISORY',
      scope: { destination: 'github.com', intentId: 'intent-github' },
    });
    expect(compiled.objectives.latency).toBeGreaterThan(compiled.objectives.cost);
  });

  it('preserves governance metadata and rejects invalid confidence', () => {
    const intent = {
      ...activeIntent({
        provenance: 'workload:developer-shell',
        confidence: 0.82,
        autonomy: 'SAFE_AUTOMATION',
      }),
      status: 'active' as const,
    };
    const compiled = compileNetworkIntent(intent);
    expect(compiled.confidence).toBe(0.82);
    expect(compiled.provenance).toBe('workload:developer-shell');
    expect(compiled.autonomy).toBe('SAFE_AUTOMATION');
    expect(compiled.scope).toMatchObject({ destination: 'github.com' });
    expect(() => activeIntent({ confidence: 1.1 })).toThrow('confidence must be between 0 and 1');
  });

  it('rejects draft and expired intents before they can enter runtime', () => {
    expect(() => compileNetworkIntent(activeIntent())).toThrow('not active');
    const expired = {
      ...activeIntent({ expiresAt: '2026-09-12T00:00:00Z' }),
      status: 'active' as const,
    };
    expect(() => compileNetworkIntent(expired, new Date('2026-09-13T00:00:00Z'))).toThrow(
      'not active',
    );
  });
});
