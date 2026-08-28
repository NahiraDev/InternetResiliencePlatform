import { describe, expect, it } from 'vitest';
import {
  AutomatedTunnelLifecycle,
  NoopLinuxTunnelAdapter,
  TunnelProviderRegistry,
  tunnelErrors,
  type Endpoint,
  type KillSwitch,
  type Tunnel,
  type TunnelConfiguration,
  type TunnelConnection,
  type TunnelHealth,
  type TunnelProvider,
} from './index.js';

const endpoint: Endpoint = { host: 'vpn.example.com', port: 443, protocol: 'custom', addressFamily: 'dual', metadata: {} };
const health: TunnelHealth = {
  status: 'healthy', connectivity: true, handshake: true, keepalive: true, routeReachable: true,
  dnsReachable: true, authenticated: true, checkedAt: new Date().toISOString(), leakProtection: 'protected', latencyMs: 20,
};
const config: TunnelConfiguration = {
  endpoint, routingMode: 'fullTunnel', scope: 'system', dnsMode: 'insideTunnel',
  authentication: { type: 'credentials', credentialRef: 'secret:vpn' }, credentialRef: 'secret:vpn',
  securityProfile: 'strict',
  capabilities: ['ipv4', 'tcp', 'fullTunnel', 'systemWide', 'authentication', 'healthCheck', 'reconnect', 'killSwitch'],
  keepalive: { enabled: true, intervalMs: 30000, timeoutMs: 5000 }, mtu: { configuredMtu: 1420, validationStatus: 'valid' },
  timeoutMs: 30000, retryLimit: 2,
};

class Provider implements TunnelProvider {
  readonly id = 'provider-a'; readonly type = 'vpn' as const; readonly protocol = 'custom' as const;
  readonly capabilities = config.capabilities; readonly endpoints = [endpoint];
  readonly supportedScopes = ['system' as const]; readonly supportedRoutingModes = ['fullTunnel' as const];
  failuresBeforeSuccess = 0; connectCalls = 0; disconnectCalls = 0; destroyCalls = 0;
  async healthCheck(): Promise<TunnelHealth> { return health; }
  async create(c: TunnelConfiguration): Promise<Tunnel> { return { id: 'tun-a', type: 'vpn', providerId: this.id, endpoint: c.endpoint, state: 'configured', capabilities: c.capabilities, securityProfile: c.securityProfile, configuration: c, health, metadata: {} }; }
  async connect(tunnel: Tunnel): Promise<TunnelConnection> {
    this.connectCalls += 1;
    if (this.connectCalls <= this.failuresBeforeSuccess) throw tunnelErrors.dependency('transient provider failure');
    return { id: `conn-${this.connectCalls}`, tunnelId: tunnel.id, state: 'connected', establishedAt: new Date().toISOString(), statistics: { bytesSent: 0, bytesReceived: 0, packetsSent: 0, packetsReceived: 0, handshakeCount: 1, reconnectCount: 0, uptimeMs: 0 } };
  }
  async disconnect(): Promise<void> { this.disconnectCalls += 1; }
  async destroy(): Promise<void> { this.destroyCalls += 1; }
}

class KillSwitchSpy implements KillSwitch {
  enabled = new Set<string>(); enableCalls = 0; disableCalls = 0;
  async enable(id: string): Promise<void> { this.enableCalls += 1; this.enabled.add(id); }
  async disable(id: string): Promise<void> { this.disableCalls += 1; this.enabled.delete(id); }
  async status(id: string): Promise<'enabled' | 'disabled'> { return this.enabled.has(id) ? 'enabled' : 'disabled'; }
}

const createLifecycle = (provider: Provider, killSwitch = new KillSwitchSpy()) => {
  const registry = new TunnelProviderRegistry();
  registry.register(provider);
  return { lifecycle: new AutomatedTunnelLifecycle(registry, new NoopLinuxTunnelAdapter(), killSwitch, undefined, undefined, { maxConnectAttempts: 3 }), killSwitch };
};

describe('Phase 52 automated tunnel lifecycle', () => {
  it('establishes only after route and health verification, then disables the safety lock', async () => {
    const provider = new Provider();
    const { lifecycle, killSwitch } = createLifecycle(provider);
    const result = await lifecycle.establish('provider-a', config);
    expect(result.tunnel.state).toBe('connected');
    expect(result.health.status).toBe('healthy');
    expect(result.attempts).toBe(1);
    expect(killSwitch.enableCalls).toBe(1);
    expect(killSwitch.disableCalls).toBe(1);
    expect(killSwitch.enabled.has('tun-a')).toBe(false);
  });

  it('retries transient provider failures through failed -> recovering -> connecting', async () => {
    const provider = new Provider();
    provider.failuresBeforeSuccess = 2;
    const { lifecycle } = createLifecycle(provider);
    const result = await lifecycle.establish('provider-a', config);
    expect(result.attempts).toBe(3);
    expect(provider.connectCalls).toBe(3);
    expect(result.tunnel.state).toBe('connected');
  });

  it('keeps the kill switch enabled when post-connect verification fails', async () => {
    const provider = new Provider();
    provider.healthCheck = async () => ({ ...health, status: 'unhealthy', connectivity: false });
    const { lifecycle, killSwitch } = createLifecycle(provider);
    await expect(lifecycle.establish('provider-a', config)).rejects.toMatchObject({ classification: 'dependencyFailure' });
    expect(killSwitch.enabled.has('tun-a')).toBe(true);
    expect(lifecycle.getTunnel('tun-a')?.state).toBeUndefined();
  });

  it('rejects full-tunnel lifecycle without a kill-switch implementation', async () => {
    const provider = new Provider();
    const registry = new TunnelProviderRegistry();
    registry.register(provider);
    const lifecycle = new AutomatedTunnelLifecycle(registry, new NoopLinuxTunnelAdapter());
    await expect(lifecycle.establish('provider-a', config)).rejects.toMatchObject({ classification: 'policyFailure' });
  });

  it('rotates endpoint credentials through a verified reconnect', async () => {
    const provider = new Provider();
    const { lifecycle } = createLifecycle(provider);
    await lifecycle.establish('provider-a', config);
    const result = await lifecycle.rotate('tun-a', { endpoint: { ...endpoint, host: 'vpn2.example.com' }, credentialRef: 'secret:vpn-rotated' });
    expect(result.tunnel.endpoint.host).toBe('vpn2.example.com');
    expect(result.tunnel.configuration.credentialRef).toBe('secret:vpn-rotated');
    expect(result.tunnel.state).toBe('connected');
    expect(provider.connectCalls).toBe(2);
    expect(provider.disconnectCalls).toBe(1);
  });

  it('rejects concurrent lifecycle operations and cleans up on destroy', async () => {
    const provider = new Provider();
    const { lifecycle } = createLifecycle(provider);
    await lifecycle.establish('provider-a', config);
    const pending = lifecycle.connect('tun-a');
    await expect(lifecycle.connect('tun-a')).rejects.toMatchObject({ code: 'TunnelStateConflict' });
    await expect(pending).rejects.toMatchObject({ code: 'TunnelStateConflict' });
    await lifecycle.disconnect('tun-a', true);
    expect(provider.destroyCalls).toBe(1);
    expect(lifecycle.getTunnel('tun-a')?.state).toBe('destroyed');
  });
});
