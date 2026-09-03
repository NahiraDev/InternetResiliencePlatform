import { describe, expect, it } from 'vitest';
import {
  InMemoryNetworkStateStore,
  type NetworkStateResource,
} from '../src/state/network-state.js';

const resource = (attributes: Record<string, unknown>): NetworkStateResource => ({
  id: 'resource-audit',
  schemaVersion: 1,
  createdAt: '2026-09-03T00:00:00.000Z',
  source: 'test',
  metadata: {},
  resourceId: 'link:primary',
  resourceType: 'network-link',
  attributes,
});

describe('InMemoryNetworkStateStore', () => {
  it('starts with an explicitly unknown reconciliation state', () => {
    const store = new InMemoryNetworkStateStore();

    expect(store.get()).toMatchObject({
      stateVersion: 0,
      reconciliation: 'unknown',
    });
  });

  it('distinguishes desired, observed and actual state', () => {
    const store = new InMemoryNetworkStateStore();
    const desired = resource({ enabled: true, route: 'primary' });
    const observed = resource({ enabled: true, route: 'primary' });
    const actual = resource({ enabled: true, route: 'primary' });

    store.apply({ layer: 'desired', resources: [desired] });
    store.apply({ layer: 'observed', resources: [observed] });
    const snapshot = store.apply({ layer: 'actual', resources: [actual] });

    expect(snapshot.stateVersion).toBe(3);
    expect(snapshot.desired).toEqual([desired]);
    expect(snapshot.observed).toEqual([observed]);
    expect(snapshot.actual).toEqual([actual]);
    expect(snapshot.reconciliation).toBe('aligned');
  });

  it('reports pending when observed and actual match but differ from desired', () => {
    const store = new InMemoryNetworkStateStore();
    const desired = resource({ route: 'secondary' });
    const current = resource({ route: 'primary' });

    store.apply({ layer: 'desired', resources: [desired] });
    store.apply({ layer: 'observed', resources: [current] });
    const snapshot = store.apply({ layer: 'actual', resources: [current] });

    expect(snapshot.reconciliation).toBe('pending');
  });

  it('rejects stale writers with optimistic version checking', () => {
    const store = new InMemoryNetworkStateStore();
    store.apply({ layer: 'desired', resources: [resource({ route: 'primary' })] });

    expect(() =>
      store.apply({
        layer: 'actual',
        resources: [],
        expectedStateVersion: 0,
      }),
    ).toThrow('Network state version conflict');
  });
});
