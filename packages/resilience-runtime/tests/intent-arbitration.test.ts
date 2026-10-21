import { describe, expect, it } from 'vitest';
import { arbitrateIntents } from '../src/intent/arbitration.js';
import type { CompiledIntent } from '../src/domain/types.js';

const makeIntent = (overrides: Partial<CompiledIntent> = {}): CompiledIntent => ({
  intentId: 'intent-1',
  version: 1,
  priority: 'normal',
  desiredOutcome: 'reach github.com',
  target: { destination: 'github.com' },
  constraints: {},
  objectives: {},
  confidence: 0.9,
  provenance: 'test',
  autonomy: 'SAFE_AUTOMATION',
  scope: { destination: 'github.com' },
  compiledAt: new Date().toISOString(),
  ...overrides,
});

describe('arbitrateIntents — Phase 83 Policy Conflict Resolution', () => {
  const now = new Date('2026-10-21T12:00:00.000Z');

  it('filters to effective intents and excludes stale ones', () => {
    const effective = makeIntent({ intentId: 'eff', effectiveFrom: '2026-10-20T00:00:00.000Z' });
    const expired = makeIntent({
      intentId: 'exp',
      expiresAt: '2026-10-20T00:00:00.000Z',
    });
    const future = makeIntent({
      intentId: 'fut',
      effectiveFrom: '2026-10-22T00:00:00.000Z',
    });

    const { ordered, conflicts } = arbitrateIntents([effective, expired, future], now);

    expect(ordered.map((i) => i.intentId)).toEqual(['eff']);
    expect(conflicts).toHaveLength(0);
  });

  it('orders by priority then version then recency', () => {
    const low = makeIntent({ intentId: 'low', priority: 'low', version: 2 });
    const high = makeIntent({ intentId: 'high', priority: 'high', version: 1 });
    const normalNew = makeIntent({
      intentId: 'normal-new',
      priority: 'normal',
      version: 3,
      compiledAt: '2026-10-21T11:00:00.000Z',
    });
    const normalOld = makeIntent({
      intentId: 'normal-old',
      priority: 'normal',
      version: 3,
      compiledAt: '2026-10-21T10:00:00.000Z',
    });

    const { ordered } = arbitrateIntents([low, high, normalNew, normalOld], now);

    expect(ordered.map((i) => i.intentId)).toEqual(['high', 'normal-new', 'normal-old', 'low']);
  });

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

  it('does not conflict when outcomes are identical', () => {
    const a = makeIntent({
      intentId: 'a',
      scope: { destination: 'github.com' },
      desiredOutcome: 'same',
    });
    const b = makeIntent({
      intentId: 'b',
      scope: { destination: 'github.com' },
      desiredOutcome: 'same',
    });

    const { conflicts } = arbitrateIntents([a, b], now);
    expect(conflicts).toHaveLength(0);
  });

  it('returns empty results for no intents', () => {
    const { ordered, conflicts } = arbitrateIntents([], now);
    expect(ordered).toHaveLength(0);
    expect(conflicts).toHaveLength(0);
  });
});
