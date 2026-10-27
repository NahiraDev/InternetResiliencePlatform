import { describe, expect, it } from 'vitest';
import { DegradableStore, type DegradablePersistence } from '../src/persistence/degradable-persistence.js';
import { RuntimePolicyArbitrator } from '../src/policy/policy.js';
import { InMemoryIntentStore } from '../src/intent/index.js';
import { compileNetworkIntent } from '../src/intent/compiler.js';
import { createRuntimeContext } from '../src/context/context.js';
import type { IntentStore } from '../src/intent/arbitration.js';
import { createNetworkIntent } from '@irp/core';

const compiled = (id: string, outcome: 'reachable' | 'blocked') =>
  compileNetworkIntent({
    ...createNetworkIntent({
      id,
      priority: 'high',
      spec: { outcome, target: { destination: 'api.example.test' } },
      confidence: 0.9,
      autonomy: 'SAFE_AUTOMATION',
    }),
    status: 'active' as const,
  });

const failingStore = (failOn: 'get' | 'record' | 'both'): IntentStore => {
  const inner = new InMemoryIntentStore();
  return {
    get: async (key: string) => {
      if (failOn === 'get' || failOn === 'both') throw new Error('store unavailable');
      return inner.get(key);
    },
    getActive: async () => {
      if (failOn === 'get' || failOn === 'both') throw new Error('store unavailable');
      return inner.getActive();
    },
    put: async (value) => inner.put(value),
    delete: async (key: string) => inner.delete(key),
    recordConflicts: async () => {
      if (failOn === 'record' || failOn === 'both') throw new Error('store unavailable');
    },
  };
};

describe('persistence degradation (issue #281)', () => {
  it('arbitrates locally when the intent store is unavailable', async () => {
    const arbitrator = new RuntimePolicyArbitrator(failingStore('get'));
    const a = compiled('a', 'reachable');
    const b = compiled('b', 'blocked');
    const context = createRuntimeContext({ compiledIntents: [a, b] });

    const result = await arbitrator.resolveIntentConflicts(context);

    // Local arbitration is authoritative even when the optional store is down.
    expect(result.persistenceDegraded).toBe(true);
    expect(result.ordered.length).toBe(2);
    expect(result.conflicts).toHaveLength(1);
  });

  it('keeps arbitration when only conflict journaling fails', async () => {
    const arbitrator = new RuntimePolicyArbitrator(failingStore('record'));
    const context = createRuntimeContext({
      compiledIntents: [compiled('a', 'reachable'), compiled('b', 'blocked')],
    });

    const result = await arbitrator.resolveIntentConflicts(context);

    expect(result.persistenceDegraded).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.ordered).toHaveLength(2);
  });

  it('does not report degradation when the store is healthy', async () => {
    const arbitrator = new RuntimePolicyArbitrator(new InMemoryIntentStore());
    const context = createRuntimeContext({
      compiledIntents: [compiled('a', 'reachable'), compiled('b', 'blocked')],
    });

    const result = await arbitrator.resolveIntentConflicts(context);

    expect(result.persistenceDegraded).toBe(false);
    expect(result.conflicts).toHaveLength(1);
  });

  it('reports persisted rather than queued when there is no remote port', async () => {
    const store = new DegradableStore();
    expect(await store.set('k', { v: 1 })).toBe('persisted');
    // Nothing was queued, so nothing may claim a retry exists.
    expect(store.pending()).toEqual([]);
    expect(store.snapshot().degraded).toBe(false);
  });

  it('actually queues and drains when the remote store is unavailable', async () => {
    const saved: Record<string, unknown> = {};
    let available = false;
    const persistence: DegradablePersistence = {
      load: async () => undefined,
      save: async (key, value) => {
        saved[key] = value;
      },
      remove: async (key) => {
        delete saved[key];
      },
      available: () => available,
    };
    const store = new DegradableStore({ persistence });

    expect(await store.set('k', { v: 1 })).toBe('queued');
    expect(store.pending()).toEqual(['k']);
    expect(store.snapshot().degraded).toBe(true);

    available = true;
    expect(await store.drain()).toEqual([]);
    expect(saved).toEqual({ k: { v: 1 } });
  });

  it('queues on a write error and recovers on retry', async () => {
    let fail = true;
    const persistence: DegradablePersistence = {
      load: async () => undefined,
      save: async () => {
        if (fail) throw new Error('connection reset');
      },
      remove: async () => undefined,
      available: () => true,
    };
    const store = new DegradableStore({ persistence });

    expect(await store.set('k', 1)).toBe('queued');
    expect(store.pending()).toEqual(['k']);

    fail = false;
    expect(await store.drain()).toEqual([]);
    expect(store.pendingCount()).toBe(0);
  });

  it('bounds the retry queue and reports what was dropped', async () => {
    const persistence: DegradablePersistence = {
      load: async () => undefined,
      save: async () => undefined,
      remove: async () => undefined,
      available: () => false,
    };
    const store = new DegradableStore({ persistence, maxPendingWrites: 3 });

    for (let i = 0; i < 10; i++) await store.set(`k${i}`, i);

    expect(store.pendingCount()).toBe(3);
    const snapshot = store.snapshot();
    expect(snapshot.droppedWrites).toBe(7);
    expect(snapshot.degraded).toBe(true);
  });

  it('keeps serving reads from the local mirror while the remote is down', async () => {
    const persistence: DegradablePersistence = {
      load: async () => undefined,
      save: async () => undefined,
      remove: async () => undefined,
      available: () => false,
    };
    const store = new DegradableStore({ persistence });
    await store.set('k', { v: 42 });
    expect(store.get('k')).toEqual({ v: 42 });
    expect(store.has('k')).toBe(true);
  });
});