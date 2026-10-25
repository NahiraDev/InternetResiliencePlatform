import { describe, expect, it } from 'vitest';
import { arbitrateIntents, InMemoryIntentStore } from '../src/intent/arbitration.js';
import { compileNetworkIntent } from '../src/intent/compiler.js';
import { createNetworkIntent } from '@irp/core';

const makeIntent = (
  id: string,
  priority: 'low' | 'normal' | 'high' | 'critical' = 'normal',
  outcome = 'reach destination',
  scope: Record<string, string> = { destination: 'github.com' },
  version = 1,
  expiresAt?: string,
) => {
  const base = createNetworkIntent({
    id,
    priority,
    spec: { outcome, target: scope },
    confidence: 0.9,
    autonomy: 'SAFE_AUTOMATION',
  });
  return compileNetworkIntent({
    ...base,
    status: 'active' as const,
    version,
    ...(expiresAt ? { expiresAt } : {}),
  });
};

  it('detects overlapping different outcomes and resolves by priority (supersede lower)', () => {
    const critical = makeIntent({
      intentId: 'crit',
      priority: 'critical',
      desiredOutcome: 'prefer tunnel',
      scope: { destination: 'github.com' },
    });
    const high = makeIntent({
      intentId: 'high',
      priority: 'high',
      desiredOutcome: 'prefer direct',
      scope: { destination: 'github.com' },
    });

    const { ordered, conflicts } = arbitrateIntents([high, critical], now);

    expect(ordered.map((i) => i.intentId)).toEqual(['crit', 'high']);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      intentA: expect.objectContaining({ intentId: 'crit' }),
      intentB: expect.objectContaining({ intentId: 'high' }),
      resolution: 'supersede-b',
    });
  });

  it('resolves same-priority by version (newer supersedes)', () => {
    const v1 = makeIntent({
      intentId: 'v1',
      priority: 'high',
      version: 1,
      desiredOutcome: 'old',
      scope: { destination: 'github.com' },
    });
    const v2 = makeIntent({
      intentId: 'v2',
      priority: 'high',
      version: 2,
      desiredOutcome: 'new',
      scope: { destination: 'github.com' },
    });

    const { conflicts } = arbitrateIntents([v1, v2], now);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.resolution).toBe('supersede-b');
  });

  it('does not conflict on non-overlapping scopes', () => {
    const a = makeIntent({ intentId: 'a', scope: { destination: 'github.com' }, desiredOutcome: 'A' });
    const b = makeIntent({ intentId: 'b', scope: { destination: 'example.com' }, desiredOutcome: 'B' });

    const { conflicts } = arbitrateIntents([a, b], now);
    expect(conflicts).toHaveLength(0);
  });

  it('excludes stale intents before conflict analysis', () => {
    // Compile a valid intent then force an expired window; the compiler rejects already-stale inputs.
    const staleBase = makeIntent('stale', 'critical', 'old');
    const stale = { ...staleBase, expiresAt: '2020-01-01T00:00:00.000Z' };
    const fresh = makeIntent('fresh', 'normal', 'new');
    const result = arbitrateIntents([stale, fresh]);
    expect(result.ordered.map((i) => i.intentId)).toEqual(['fresh']);
    expect(result.conflicts).toHaveLength(0);
  });

  it('resolves same-priority same-version by recency (more recent supersedes)', () => {
    const older = makeIntent({
      intentId: 'older',
      priority: 'high',
      version: 2,
      desiredOutcome: 'old-outcome',
      compiledAt: '2026-10-21T10:00:00.000Z',
      scope: { destination: 'github.com' },
    });
    const newer = makeIntent({
      intentId: 'newer',
      priority: 'high',
      version: 2,
      desiredOutcome: 'new-outcome',
      compiledAt: '2026-10-21T11:00:00.000Z',
      scope: { destination: 'github.com' },
    });

    const { ordered, conflicts } = arbitrateIntents([older, newer], now);

    expect(ordered.map((i) => i.intentId)).toEqual(['newer', 'older']);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      intentA: expect.objectContaining({ intentId: 'newer' }),
      intentB: expect.objectContaining({ intentId: 'older' }),
      resolution: 'supersede-b',
    });
  });

  it('returns empty results for no intents', () => {
    const { ordered, conflicts } = arbitrateIntents([], now);
    expect(ordered).toHaveLength(0);
    expect(conflicts).toHaveLength(0);
  });
});
