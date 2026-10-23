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
) =>
  compileNetworkIntent({
    ...createNetworkIntent({
      id,
      priority,
      spec: { outcome, target: { destination: 'github.com' } },
      confidence: 0.9,
      autonomy: 'SAFE_AUTOMATION',
    }),
    status: 'active' as const,
    version,
    scope,
    ...(expiresAt ? { expiresAt } : {}),
  });

describe('intent arbitration (Phase 83)', () => {
  it('returns ordered intents and empty conflicts when no overlap', () => {
    const a = makeIntent('a', 'high', 'reach A', { destination: 'a.com' });
    const b = makeIntent('b', 'normal', 'reach B', { destination: 'b.com' });
    const result = arbitrateIntents([a, b]);
    expect(result.ordered.map((i) => i.intentId)).toEqual(['a', 'b']);
    expect(result.conflicts).toHaveLength(0);
  });

  it('detects conflict and supersedes by priority', () => {
    const high = makeIntent('high', 'critical', 'prefer-fast');
    const low = makeIntent('low', 'low', 'prefer-cheap');
    const result = arbitrateIntents([low, high]);
    expect(result.ordered[0]?.intentId).toBe('high');
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.resolution).toBe('supersede-b');
    expect(result.conflicts[0]?.intentA.intentId).toBe('high');
  });

  it('supersedes by version when priority is equal', () => {
    const v2 = makeIntent('same', 'high', 'outcome-v2', { destination: 'github.com' }, 2);
    const v1 = makeIntent('same', 'high', 'outcome-v1', { destination: 'github.com' }, 1);
    const result = arbitrateIntents([v1, v2]);
    expect(result.ordered[0]?.version).toBe(2);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.resolution).toBe('supersede-b');
  });

  it('excludes stale intents before conflict analysis', () => {
    const stale = makeIntent('stale', 'critical', 'old', { destination: 'github.com' }, 1, '2020-01-01T00:00:00.000Z');
    const fresh = makeIntent('fresh', 'normal', 'new');
    const result = arbitrateIntents([stale, fresh]);
    expect(result.ordered.map((i) => i.intentId)).toEqual(['fresh']);
    expect(result.conflicts).toHaveLength(0);
  });

  it('does not flag conflict for identical outcomes on overlapping scope', () => {
    const a = makeIntent('a', 'high', 'same-outcome');
    const b = makeIntent('b', 'normal', 'same-outcome');
    const result = arbitrateIntents([a, b]);
    expect(result.conflicts).toHaveLength(0);
  });

  it('records conflicts in InMemoryIntentStore', async () => {
    const store = new InMemoryIntentStore();
    const a = makeIntent('a', 'critical', 'fast');
    const b = makeIntent('b', 'low', 'cheap');
    await store.put(a);
    await store.put(b);
    const { conflicts } = arbitrateIntents([a, b]);
    await store.recordConflicts(conflicts);
    const recorded = await store.listConflicts();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.resolution).toBe('supersede-b');
  });
});
