import { describe, expect, it } from 'vitest';
import { InMemoryGatewayRegistry, type GatewayMetadata } from './index.js';

const gateway = (overrides: Partial<GatewayMetadata> = {}): GatewayMetadata => ({
  id: 'gw-1',
  name: 'Primary gateway',
  endpoint: { host: 'gateway.example.test', port: 443, family: 'dual' },
  ownership: { ownerId: 'owner-1', managedBy: 'control-plane' },
  capabilities: {
    tunnelProtocols: ['wireguard'],
    addressFamilies: ['dual'],
    transports: ['udp'],
    features: ['health-check'],
  },
  lifecycle: 'registered',
  trust: 'pending',
  tags: ['primary', 'prod'],
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
  ...overrides,
});

describe('@irp/gateway-registry', () => {
  it('registers and returns defensive copies', () => {
    const registry = new InMemoryGatewayRegistry();
    const registered = registry.register(gateway());
    registered.tags.push('mutated');

    expect(registry.get('gw-1')?.tags).toEqual(['primary', 'prod']);
  });

  it('rejects duplicate gateway ids and invalid endpoint ports', () => {
    const registry = new InMemoryGatewayRegistry();
    registry.register(gateway());
    expect(() => registry.register(gateway())).toThrow('already exists');
    expect(() => registry.register(gateway({ id: 'gw-2', endpoint: { host: 'x', port: 70000, family: 'ipv4' } }))).toThrow(
      'port must be an integer between 1 and 65535',
    );
  });

  it('filters by lifecycle, trust, ownership, region and tags', () => {
    const registry = new InMemoryGatewayRegistry();
    registry.register(gateway({ region: 'eu-west', trust: 'trusted' }));
    registry.register(gateway({ id: 'gw-2', region: 'ir-central', tags: ['regional'], lifecycle: 'active', trust: 'trusted' }));

    expect(registry.list({ region: 'ir-central' }).map((item) => item.id)).toEqual(['gw-2']);
    expect(registry.list({ lifecycle: 'active', tag: 'regional' }).map((item) => item.id)).toEqual(['gw-2']);
    expect(registry.list({ trust: 'trusted' })).toHaveLength(2);
  });

  it('enforces lifecycle transitions and retirement deletion', () => {
    const registry = new InMemoryGatewayRegistry();
    registry.register(gateway());

    registry.transition('gw-1', 'active');
    registry.transition('gw-1', 'draining');
    registry.transition('gw-1', 'disabled');
    registry.transition('gw-1', 'retired');
    expect(registry.remove('gw-1').lifecycle).toBe('retired');
    expect(registry.get('gw-1')).toBeUndefined();
  });

  it('rejects unsafe lifecycle transitions and deletion before retirement', () => {
    const registry = new InMemoryGatewayRegistry();
    registry.register(gateway());

    expect(() => registry.transition('gw-1', 'draining')).toThrow('invalid gateway lifecycle transition');
    expect(() => registry.remove('gw-1')).toThrow('only retired gateways can be removed');
  });

  it('prevents trust restoration after revocation', () => {
    const registry = new InMemoryGatewayRegistry();
    registry.register(gateway());
    registry.setTrust('gw-1', 'revoked');

    expect(() => registry.setTrust('gw-1', 'trusted')).toThrow('explicit re-registration');
  });

  it('updates metadata without changing identity or lifecycle implicitly', () => {
    const registry = new InMemoryGatewayRegistry();
    registry.register(gateway());

    const updated = registry.update('gw-1', { region: 'ir-central', tags: ['regional'] });
    expect(updated.id).toBe('gw-1');
    expect(updated.lifecycle).toBe('registered');
    expect(updated.region).toBe('ir-central');
    expect(updated.tags).toEqual(['regional']);
  });
});
