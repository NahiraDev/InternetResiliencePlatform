import { describe, expect, it } from 'vitest';
import { NetworkPathGraph, normalizeRoute, type NetworkPath } from '@irp/routing';
import {
  ProgrammableConnectivityFabric,
  type FabricDiscoveryProvider,
  type FabricResource,
} from '../src/fabric.js';

const resource = (
  id: string,
  score: number,
  domain: string,
  owner = 'test-provider',
): FabricResource => ({
  id,
  kind: 'Gateway',
  state: score >= 70 ? 'HEALTHY' : 'DEGRADED',
  health: {
    status: score >= 70 ? 'healthy' : 'degraded',
    score,
    checkedAt: new Date().toISOString(),
  },
  confidence: 0.9,
  observedAt: new Date().toISOString(),
  trust: 0.9,
  capacity: {},
  cost: { unit: score >= 70 ? 2 : 1 },
  owner,
  failureDomains: [domain],
  lifecycle: 'discovered',
  capabilities: [
    {
      id: 'route.select',
      scope: 'gateway',
      authority: 'provider',
      trust: 0.9,
      safety: 'read-only',
      platforms: ['linux'],
    },
  ],
  metadata: {},
});

describe('ProgrammableConnectivityFabric', () => {
  it('discovers bounded resources with explicit ownership and selects a fresh capable resource', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const provider: FabricDiscoveryProvider = {
      id: 'linux-gateway-discovery',
      owner: 'linux-client',
      async discover() {
        return [resource('gw-a', 80, 'isp-a'), resource('gw-b', 90, 'isp-b')];
      },
    };
    fabric.registerProvider(provider);
    const snapshot = await fabric.discover({ limit: 2 });
    expect(snapshot.resources).toHaveLength(2);
    expect(snapshot.resources.every((entry) => entry.owner)).toBe(true);
    expect(fabric.select({ requiredCapabilities: ['route.select'] }).selected?.id).toBe('gw-b');
  });

  it('rejects stale resources and conflicting ownership', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    fabric.registerProvider({
      id: 'provider-a',
      owner: 'owner-a',
      async discover() {
        return [
          {
            ...resource('gw-stale', 80, 'isp-a'),
            expiresAt: new Date(Date.now() - 1_000).toISOString(),
          },
        ];
      },
    });

    await fabric.discover();
    expect(fabric.select().rejected).toEqual([{ id: 'gw-stale', reason: 'stale-resource' }]);

    const conflicting = new ProgrammableConnectivityFabric();
    conflicting.registerProvider({
      id: 'provider-a',
      owner: 'owner-a',
      async discover() {
        return [resource('same', 90, 'isp-a', 'owner-a')];
      },
    });
    conflicting.registerProvider({
      id: 'provider-b',
      owner: 'owner-b',
      async discover() {
        return [resource('same', 90, 'isp-b', 'owner-b')];
      },
    });

    await expect(conflicting.discover({ limit: 2 })).rejects.toThrow(
      'duplicate fabric ownership for resource same',
    );
  });

  it('supports cancellation and incremental discovery', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    let calls = 0;
    fabric.registerProvider({
      id: 'incremental',
      owner: 'owner-a',
      async discover(context) {
        calls += 1;
        return context.since ? [resource('gw-b', 90, 'isp-b')] : [resource('gw-a', 80, 'isp-a')];
      },
    });

    await fabric.discover();
    const controller = new AbortController();
    controller.abort();
    await expect(fabric.discover({ signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });

    await fabric.discover({ since: new Date().toISOString(), limit: 1 });
    expect(calls).toBe(2);
    expect(fabric.snapshotState().resources.map((entry) => entry.id)).toEqual(['gw-a', 'gw-b']);
  });

  it('registers capabilities in the unified fabric registry', () => {
    const fabric = new ProgrammableConnectivityFabric();
    fabric.capabilityAuthority.register({
      id: 'route.select',
      scope: 'gateway',
      authority: 'adapter',
      trust: 0.9,
      safety: 'governed',
      platforms: ['linux', 'macos'],
    });

    expect(fabric.capabilityAuthority.get('route.select')?.scope).toBe('gateway');
    expect(fabric.capabilityAuthority.list()).toHaveLength(1);
  });

  it('reconciles NetworkPathGraph into the same fabric identity space', () => {
    const path: NetworkPath = {
      id: 'path-a',
      type: 'direct',
      hops: ['gw-a'],
      route: normalizeRoute({
        id: 'route-a',
        destination: '0.0.0.0/0',
        gateway: 'gw-a',
        interfaceName: 'eth0',
        state: 'available',
        metadata: { failureDomain: 'isp-a' },
      }),
      capabilities: ['ipv4'],
      state: 'available',
      metadata: { failureDomain: 'isp-a' },
    };
    const snapshot = new ProgrammableConnectivityFabric().reconcileRoutingGraph(
      new NetworkPathGraph([path]),
    );
    expect(snapshot.resources.some((entry) => entry.kind === 'Route')).toBe(true);
    expect(snapshot.resources.some((entry) => entry.kind === 'Interface')).toBe(true);
    expect(snapshot.edges.some((edge) => edge.relation === 'uses_gateway')).toBe(true);
    const routeResource = snapshot.resources.find((entry) => entry.kind === 'Route');
    expect(routeResource).toBeDefined();
    expect(snapshot.edges.some((edge) => edge.from === routeResource?.id)).toBe(true);
  });
});
