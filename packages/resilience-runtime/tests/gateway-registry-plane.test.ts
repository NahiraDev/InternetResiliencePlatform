import { describe, expect, it } from 'vitest';
import {
  ConnectivityManager,
  type ConnectivityHealth,
  type ConnectivityProvider,
  type ConnectivityResource,
} from '@irp/connectivity';
import { GatewayRegistrySelectionPlane } from '../src/gateway/gateway-registry-plane.js';

const resource = (id: string, providerId: string, score: number, status: ConnectivityHealth['status']): ConnectivityResource => ({
  providerId,
  id,
  type: id.startsWith('wifi') ? 'wifi' : 'ethernet',
  interfaceName: id,
  state: 'available',
  addresses: ['192.0.2.10'],
  dnsServers: ['1.1.1.1'],
  capabilities: [
    'connect',
    'disconnect',
    'activate',
    'deactivate',
    'monitor',
    'health-check',
    'supports-ipv4',
    'supports-default-route',
    'supports-dns',
  ],
  health: {
    score,
    status,
    internetReachable: status !== 'unhealthy',
    gatewayReachable: true,
    checkedAt: new Date().toISOString(),
    source: 'simulation',
  },
  priority: score,
  metadata: {},
});

class FakeConnectivityProvider implements ConnectivityProvider {
  readonly id = 'fake';
  readonly type = 'ethernet' as const;
  readonly resources: ConnectivityResource[] = [];
  active: string | undefined;

  constructor(resources: readonly [ConnectivityResource, ConnectivityResource]) {
    this.resources = [...resources];
  }

  async discover() {
    return this.resources;
  }
  async getState(resourceId?: string) {
    return resourceId === this.active ? ('active' as const) : ('available' as const);
  }
  async getHealth(resourceId?: string): Promise<ConnectivityHealth> {
    const item = this.resources.find((candidate) => candidate.id === resourceId) ?? this.resources[0];
    return item.health!;
  }
  async connect(resourceId: string) {
    this.active = resourceId;
    return { ok: true, resourceId, state: 'connected' as const };
  }
  async disconnect(resourceId: string) {
    return { ok: true, resourceId, state: 'available' as const };
  }
  async activate(resourceId: string) {
    this.active = resourceId;
    return { ok: true, resourceId, state: 'active' as const };
  }
  async deactivate(resourceId: string) {
    return { ok: true, resourceId, state: 'available' as const };
  }
  capabilities() {
    return resource('wifi0', 'fake', 100, 'healthy').capabilities;
  }
}

const buildConnectivity = async () => {
  const connectivity = new ConnectivityManager();
  await connectivity.registerProvider(
    new FakeConnectivityProvider([
      resource('eth0', 'fake', 60, 'degraded'),
      resource('wifi0', 'fake', 95, 'healthy'),
    ]),
  );
  await connectivity.discoverResources();
  return connectivity;
};

describe('GatewayRegistrySelectionPlane', () => {
  it('reports disabled configuration when not enabled', async () => {
    const connectivity = await buildConnectivity();
    const plane = new GatewayRegistrySelectionPlane(connectivity, { enabled: false });
    expect(plane.configured).toBe(false);
  });

  it('synchronizes connectivity sources as gateway metadata and selects the healthiest', async () => {
    const connectivity = await buildConnectivity();
    const plane = new GatewayRegistrySelectionPlane(connectivity, { enabled: true });
    expect(plane.configured).toBe(true);

    await plane.synchronize();
    const gateways = plane.gateways();
    expect(gateways.map((gateway) => gateway.id).sort()).toEqual(['fake:eth0', 'fake:wifi0']);
    await plane.apply('fake:eth0');
    expect(plane.currentGatewayId).toBe('fake:eth0');

    const decision = await plane.evaluate();
    expect(decision.selectedGatewayId).toBe('fake:wifi0');
    expect(decision.switched).toBe(true);
    expect(decision.candidates.length).toBe(2);
    expect(decision.candidates.every((candidate) => candidate.eligible)).toBe(true);
  });

  it('applies a selection by switching the live connectivity source', async () => {
    const connectivity = await buildConnectivity();
    const plane = new GatewayRegistrySelectionPlane(connectivity, { enabled: true });
    await plane.synchronize();
    await plane.apply('fake:wifi0');
    expect(connectivity.getActiveSource()?.sourceId).toBe('fake:wifi0');
    expect(plane.currentGatewayId).toBe('fake:wifi0');
  });

  it('throws when applying a gateway without a matching connectivity source', async () => {
    const connectivity = await buildConnectivity();
    const plane = new GatewayRegistrySelectionPlane(connectivity, { enabled: true });
    await plane.synchronize();
    await expect(plane.apply('missing')).rejects.toThrow(/no matching connectivity source/);
  });
});