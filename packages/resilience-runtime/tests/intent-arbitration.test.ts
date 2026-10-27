import { describe, expect, it } from 'vitest';
import { createNetworkIntent } from '@irp/core';
import { arbitrateIntents, InMemoryIntentStore } from '../src/intent/arbitration.js';
import { compileNetworkIntent } from '../src/intent/compiler.js';

const arbitrationTime = new Date('2026-10-25T20:00:00.000Z');

type MakeIntentOptions = {
  id: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  outcome?: string;
  scope?: Record<string, string>;
  version?: number;
  compiledAt?: string;
};

const makeIntent = ({
  id,
  priority = 'normal',
  outcome = 'reach destination',
  scope = { destination: 'github.com' },
  version = 1,
  compiledAt = arbitrationTime.toISOString(),
}: MakeIntentOptions) => {
  const timestamp = new Date(compiledAt);
  const base = createNetworkIntent({
    id,
    priority,
    spec: { outcome, target: scope },
    confidence: 0.9,
    autonomy: 'SAFE_AUTOMATION',
    createdAt: timestamp.toISOString(),
    updatedAt: timestamp.toISOString(),
  });

  return compileNetworkIntent(
    {
      ...base,
      status: 'active' as const,
      version,
    },
    timestamp,
  );
};

describe('intent arbitration', () => {
  it('detects overlapping different outcomes and resolves by priority', () => {
    const critical = makeIntent({
      id: 'critical',
      priority: 'critical',
      outcome: 'prefer tunnel',
    });
    const high = makeIntent({
      id: 'high',
      priority: 'high',
      outcome: 'prefer direct',
    });

    const { ordered, conflicts } = arbitrateIntents([high, critical], arbitrationTime);

    expect(ordered.map((intent) => intent.intentId)).toEqual(['critical', 'high']);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      intentA: expect.objectContaining({ intentId: 'critical' }),
      intentB: expect.objectContaining({ intentId: 'high' }),
      resolution: 'supersede-b',
    });
  });

  it('resolves same-priority conflicts by version, with the newer version first', () => {
    const v1 = makeIntent({
      id: 'v1',
      priority: 'high',
      version: 1,
      outcome: 'old outcome',
    });
    const v2 = makeIntent({
      id: 'v2',
      priority: 'high',
      version: 2,
      outcome: 'new outcome',
    });

    const { ordered, conflicts } = arbitrateIntents([v1, v2], arbitrationTime);

    expect(ordered.map((intent) => intent.intentId)).toEqual(['v2', 'v1']);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      intentA: expect.objectContaining({ intentId: 'v2' }),
      intentB: expect.objectContaining({ intentId: 'v1' }),
      resolution: 'supersede-b',
    });
  });

  it('does not report conflicts for non-overlapping scopes', () => {
    const a = makeIntent({
      id: 'a',
      scope: { destination: 'github.com' },
      outcome: 'prefer tunnel',
    });
    const b = makeIntent({
      id: 'b',
      scope: { destination: 'example.com' },
      outcome: 'prefer direct',
    });

    const { conflicts } = arbitrateIntents([a, b], arbitrationTime);

    expect(conflicts).toHaveLength(0);
  });

  it('excludes stale intents before conflict analysis', () => {
    const stale = {
      ...makeIntent({ id: 'stale', priority: 'critical', outcome: 'old outcome' }),
      expiresAt: '2020-01-01T00:00:00.000Z',
    };
    const fresh = makeIntent({ id: 'fresh', priority: 'normal', outcome: 'new outcome' });

    const { ordered, conflicts } = arbitrateIntents([stale, fresh], arbitrationTime);

    expect(ordered.map((intent) => intent.intentId)).toEqual(['fresh']);
    expect(conflicts).toHaveLength(0);
  });

  it('uses compilation recency to break otherwise equal ties', () => {
    const older = makeIntent({
      id: 'older',
      priority: 'high',
      version: 2,
      outcome: 'old outcome',
      compiledAt: '2026-10-21T10:00:00.000Z',
    });
    const newer = makeIntent({
      id: 'newer',
      priority: 'high',
      version: 2,
      outcome: 'new outcome',
      compiledAt: '2026-10-21T11:00:00.000Z',
    });

    const { ordered, conflicts } = arbitrateIntents([older, newer], arbitrationTime);

    expect(ordered.map((intent) => intent.intentId)).toEqual(['newer', 'older']);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      intentA: expect.objectContaining({ intentId: 'newer' }),
      intentB: expect.objectContaining({ intentId: 'older' }),
      resolution: 'supersede-b',
    });
  });

  it('returns empty results when no intents are supplied', () => {
    const { ordered, conflicts } = arbitrateIntents([], arbitrationTime);

    expect(ordered).toHaveLength(0);
    expect(conflicts).toHaveLength(0);
  });

  it('stores and retrieves intents and recorded conflicts', async () => {
    const preferred = makeIntent({ id: 'preferred', priority: 'critical', outcome: 'tunnel' });
    const superseded = makeIntent({ id: 'superseded', priority: 'normal', outcome: 'direct' });
    const store = new InMemoryIntentStore();

    await store.put(preferred);
    await store.put(superseded);
    await store.recordConflicts([
      {
        intentA: preferred,
        intentB: superseded,
        reason: 'overlapping scope with different outcomes',
        resolution: 'supersede-b',
      },
    ]);

    expect(await store.get('preferred')).toEqual(preferred);
    expect(await store.getActive(arbitrationTime)).toHaveLength(2);
    expect(await store.listConflicts()).toHaveLength(1);

    await store.delete('superseded');
    expect(await store.get('superseded')).toBeUndefined();
  });
});
