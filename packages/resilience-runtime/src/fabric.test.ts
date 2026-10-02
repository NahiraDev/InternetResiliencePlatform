import { describe, expect, it } from 'vitest';
import { NetworkPathGraph, normalizeRoute, type NetworkPath } from '@irp/routing';
import { ProgrammableConnectivityFabric, type FabricDiscoveryProvider, type FabricResource } from './fabric.js';

const resource = (id: string, score: number, domain: string): FabricResource => ({
  id, kind: 'Gateway', state: score >= 70 ? 'HEALTHY' : 'DEGRADED',
  health: { status: score >= 70 ? 'healthy' : 'degraded', score, checkedAt: new Date().toISOString() },
  confidence: 0.9, observedAt: new Date().toISOString(), trust: 0.9, capacity: {},
  cost: { unit: score >= 70 ? 2 : 1 }, owner: 'test-provider', failureDomains: [domain],
  lifecycle: 'discovered',
  capabilities: [{ id: 'route.select', scope: 'gateway', authority: 'provider', trust: 0.9, safety: 'read-only', platforms: ['linux'] }],
  metadata: {},
});

describe('ProgrammableConnectivityFabric', () => {
  it('discovers bounded resources with explicit ownership and selects a fresh capable resource', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const provider: FabricDiscoveryProvider = {
      id: 'linux-gateway-discovery', owner: 'linux-client',
      async discover() { return [resource('gw-a', 80, 'isp-a'), resource('gw-b', 90, 'isp-b')]; },
    };
    fabric.registerProvider(provider);
    const snapshot = await fabric.discover({ limit: 2 });
    expect(snapshot.resources).toHaveLength(2);
    expect(snapshot.resources.every(entry => entry.owner)).toBe(true);
    expect(fabric.select({ requiredCapabilities: ['route.select'] }).selected?.id).toBe('gw-b');
  });

  it('reconciles NetworkPathGraph into the same fabric identity space', () => {
    const path: NetworkPath = {
      id: 'path-a', type: 'direct', hops: ['gw-a'],
      route: normalizeRoute({
        id: 'route-a', destination: '0.0.0.0/0', gateway: 'gw-a', interfaceName: 'eth0',
        state: 'available', metadata: { failureDomain: 'isp-a' },
      }),
      capabilities: ['ipv4'], state: 'available', metadata: { failureDomain: 'isp-a' },
    };
    const snapshot = new ProgrammableConnectivityFabric().reconcileRoutingGraph(new NetworkPathGraph([path]));
    expect(snapshot.resources.some(entry => entry.kind === 'Route')).toBe(true);
    expect(snapshot.resources.some(entry => entry.kind === 'Interface')).toBe(true);
    expect(snapshot.edges.some(edge => edge.relation === 'uses_gateway')).toBe(true);
  });
});
