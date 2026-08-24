import { describe, expect, it, vi } from 'vitest';
import { InMemoryTunnelManager, type TunnelProvider, type TunnelTarget } from './tunnel.js';

const target: TunnelTarget = {
  gatewayId: 'gw-1',
  endpoint: { host: '198.51.100.10', port: 443, family: 'ipv4' },
  protocol: 'wireguard',
  transport: 'udp',
  addressFamily: 'ipv4',
};

function provider(overrides: Partial<TunnelProvider> = {}): TunnelProvider {
  return {
    id: 'test-provider',
    capabilities: () => ({
      protocols: ['wireguard'],
      transports: ['udp'],
      addressFamilies: ['ipv4'],
      supportsReconnect: true,
      supportsHealthCheck: true,
    }),
    connect: vi.fn(async () => ({ id: 'connection-1' })),
    disconnect: vi.fn(async () => undefined),
    healthCheck: vi.fn(async () => ({ reachable: true, latencyMs: 40, packetLossPercent: 0, checkedAt: new Date().toISOString() })),
    ...overrides,
  };
}

describe('secure tunnel abstraction', () => {
  it('connects through a provider-neutral contract and records lifecycle state', async () => {
    const p = provider();
    const manager = new InMemoryTunnelManager(p);
    const session = await manager.connect({ target, timeoutMs: 100 });

    expect(session.lifecycle).toBe('connected');
    expect(session.target).toEqual(target);
    expect(session.connectedAt).toBeDefined();
    expect(p.connect).toHaveBeenCalledOnce();
  });

  it('rejects unsupported protocol, transport and address family before provider execution', async () => {
    const p = provider({ capabilities: () => ({ protocols: ['other'], transports: ['tcp'], addressFamilies: ['ipv6'], supportsReconnect: true, supportsHealthCheck: true }) });
    const manager = new InMemoryTunnelManager(p);

    await expect(manager.connect({ target, timeoutMs: 100 })).rejects.toThrow('provider does not support tunnel protocol wireguard');
    expect(p.connect).not.toHaveBeenCalled();
  });

  it('bounds a hanging provider connect operation', async () => {
    const p = provider({ connect: vi.fn(() => new Promise(() => undefined)) });
    const manager = new InMemoryTunnelManager(p);

    await expect(manager.connect({ target, timeoutMs: 10 })).rejects.toThrow('tunnel connect timed out');
    expect(manager.list()[0]?.lifecycle).toBe('failed');
  });

  it('disconnects cleanly and rejects unsafe disconnect during connect', async () => {
    const p = provider();
    const manager = new InMemoryTunnelManager(p);
    const session = await manager.connect({ target, timeoutMs: 100 });

    const disconnected = await manager.disconnect(session.id, 100);
    expect(disconnected.lifecycle).toBe('disconnected');
    expect(p.disconnect).toHaveBeenCalledOnce();
  });

  it('reconnects only when the provider advertises reconnect support', async () => {
    const p = provider({ capabilities: () => ({ protocols: ['wireguard'], transports: ['udp'], addressFamilies: ['ipv4'], supportsReconnect: false, supportsHealthCheck: true }) });
    const manager = new InMemoryTunnelManager(p);
    const session = await manager.connect({ target, timeoutMs: 100 });

    await expect(manager.reconnect(session.id, 100)).rejects.toThrow('provider does not support reconnect');
  });

  it('updates health without changing routing or gateway state', async () => {
    const p = provider();
    const manager = new InMemoryTunnelManager(p);
    const session = await manager.connect({ target, timeoutMs: 100 });

    const healthy = await manager.healthCheck(session.id, 100);
    expect(healthy.lifecycle).toBe('connected');
    expect(healthy.health?.latencyMs).toBe(40);
  });

  it('marks an unreachable tunnel degraded rather than silently disconnecting it', async () => {
    const p = provider({ healthCheck: vi.fn(async () => ({ reachable: false, checkedAt: new Date().toISOString() })) });
    const manager = new InMemoryTunnelManager(p);
    const session = await manager.connect({ target, timeoutMs: 100 });

    const degraded = await manager.healthCheck(session.id, 100);
    expect(degraded.lifecycle).toBe('degraded');
    expect(degraded.health?.reachable).toBe(false);
  });

  it('bounds a hanging health check', async () => {
    const p = provider({ healthCheck: vi.fn(() => new Promise(() => undefined)) });
    const manager = new InMemoryTunnelManager(p);
    const session = await manager.connect({ target, timeoutMs: 100 });

    await expect(manager.healthCheck(session.id, 10)).rejects.toThrow('tunnel health check timed out');
  });

  it('does not persist opaque provider connection context in the session', async () => {
    const p = provider();
    const manager = new InMemoryTunnelManager(p);
    const secretContext = { privateKey: 'must-not-be-stored' };
    const session = await manager.connect({ target, timeoutMs: 100, context: secretContext });

    expect(session).not.toHaveProperty('context');
    expect(session).not.toHaveProperty('privateKey');
  });

  it('returns defensive copies of sessions', async () => {
    const manager = new InMemoryTunnelManager(provider());
    const session = await manager.connect({ target, timeoutMs: 100 });
    session.target.endpoint.host = 'tampered.example';

    expect(manager.get(session.id)?.target.endpoint.host).toBe(target.endpoint.host);
  });
});
