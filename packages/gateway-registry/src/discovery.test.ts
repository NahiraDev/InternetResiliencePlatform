import { describe, expect, it } from 'vitest';
import { GatewayDiscovery } from './discovery.js';
import { InMemoryGatewayRegistry, type GatewayMetadata } from './index.js';

const gateway = (id: string, updatedAt = '2026-08-24T00:00:00.000Z'): GatewayMetadata => ({
  id,
  name: id,
  endpoint: { host: `${id}.example.test`, port: 443, family: 'dual' },
  ownership: { ownerId: 'owner-1', managedBy: 'control-plane' },
  capabilities: { tunnelProtocols: ['wireguard'], addressFamilies: ['dual'], transports: ['udp'], features: [] },
  lifecycle: 'registered',
  trust: 'pending',
  tags: ['regional'],
  createdAt: updatedAt,
  updatedAt,
});

describe('gateway discovery', () => {
  it('registers discovered gateways and updates existing metadata', async () => {
    const registry = new InMemoryGatewayRegistry();
    registry.register(gateway('gw-existing'));
    const discovery = new GatewayDiscovery(registry, { staleAfterMs: 60_000, now: () => Date.parse('2026-08-24T00:00:10.000Z') });

    const result = await discovery.refresh({
      discover: async () => [gateway('gw-existing'), { ...gateway('gw-new'), region: 'ir-central' }],
    });

    expect(result.discovered).toBe(2);
    expect(result.updated).toBe(1);
    expect(result.registered).toBe(1);
    expect(registry.get('gw-new')?.region).toBe('ir-central');
  });

  it('does not resurrect retired gateways', async () => {
    const registry = new InMemoryGatewayRegistry();
    registry.register(gateway('gw-retired'));
    registry.transition('gw-retired', 'retired');
    const discovery = new GatewayDiscovery(registry, { staleAfterMs: 60_000 });

    const result = await discovery.refresh({ discover: async () => [gateway('gw-retired')] });

    expect(result.rejected).toBe(1);
    expect(result.errors[0]?.reason).toContain('retired');
    expect(registry.get('gw-retired')?.lifecycle).toBe('retired');
  });

  it('reports previously known gateways as stale without changing lifecycle', async () => {
    const registry = new InMemoryGatewayRegistry();
    registry.register(gateway('gw-old'));
    const discovery = new GatewayDiscovery(registry, { staleAfterMs: 60_000, now: () => Date.parse('2026-08-24T00:02:00.000Z') });

    const result = await discovery.refresh({ discover: async () => [] });

    expect(result.stale).toBe(1);
    expect(registry.get('gw-old')?.lifecycle).toBe('registered');
  });
});
