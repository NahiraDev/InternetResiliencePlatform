import { describe, expect, it } from 'vitest';
import {
  TunnelManager,
  TunnelProviderRegistry,
  TunnelSelector,
  redacted,
  simulateFailover,
  simulateTunnelConnection,
  supportedProtocolStatus,
  transitionTunnel,
  tunnelErrors,
  validateEndpoint,
  validateTunnelConfiguration,
  type Endpoint,
  type Tunnel,
  type TunnelConfiguration,
  type TunnelConnection,
  type TunnelHealth,
  type TunnelProvider,
  type TunnelEventBus,
} from './index.js';

const endpoint: Endpoint = {
  host: 'vpn.example.com',
  port: 443,
  protocol: 'custom',
  addressFamily: 'dual',
  metadata: {},
};
const health: TunnelHealth = {
  status: 'healthy',
  connectivity: true,
  handshake: true,
  keepalive: true,
  routeReachable: true,
  dnsReachable: true,
  authenticated: true,
  checkedAt: new Date().toISOString(),
  leakProtection: 'protected',
  latencyMs: 25,
};
const config: TunnelConfiguration = {
  endpoint,
  routingMode: 'fullTunnel',
  scope: 'system',
  dnsMode: 'insideTunnel',
  authentication: { type: 'credentials', credentialRef: 'secret:vpn' },
  credentialRef: 'secret:vpn',
  securityProfile: 'strict',
  capabilities: [
    'ipv4',
    'tcp',
    'fullTunnel',
    'systemWide',
    'authentication',
    'healthCheck',
    'reconnect',
    'killSwitch',
  ],
  keepalive: { enabled: true, intervalMs: 30000, timeoutMs: 5000 },
  mtu: { configuredMtu: 1420, validationStatus: 'valid' },
  timeoutMs: 30000,
  retryLimit: 2,
};
class Provider implements TunnelProvider {
  readonly id = 'provider-a';
  readonly type = 'vpn' as const;
  readonly protocol = 'custom' as const;
  readonly capabilities = config.capabilities;
  readonly endpoints = [endpoint];
  readonly supportedScopes = ['system' as const];
  readonly supportedRoutingModes = ['fullTunnel' as const];
  fail?: 'auth' | 'handshake' | 'timeout';
  async healthCheck() {
    return health;
  }
  async create(c: TunnelConfiguration): Promise<Tunnel> {
    return {
      id: 'tun-a',
      type: 'vpn',
      providerId: this.id,
      endpoint: c.endpoint,
      state: 'configured',
      capabilities: c.capabilities,
      securityProfile: c.securityProfile,
      configuration: c,
      health,
      metadata: {},
    };
  }
  async connect(t: Tunnel): Promise<TunnelConnection> {
    if (this.fail === 'auth') throw tunnelErrors.auth('auth failed');
    if (this.fail === 'handshake') throw new Error('handshake failed');
    if (this.fail === 'timeout') throw new Error('timeout');
    return {
      id: 'conn-a',
      tunnelId: t.id,
      state: 'connected',
      establishedAt: new Date().toISOString(),
      statistics: {
        bytesSent: 0,
        bytesReceived: 0,
        packetsSent: 0,
        packetsReceived: 0,
        handshakeCount: 1,
        reconnectCount: 0,
        uptimeMs: 0,
      },
    };
  }
  async disconnect() {}
  async destroy() {}
}

describe('phase 17 tunnel layer', () => {
  it('validates endpoints and configurations', () => {
    expect(() => validateEndpoint(endpoint)).not.toThrow();
    expect(() => validateEndpoint({ ...endpoint, port: 0 })).toThrow(/port/);
    expect(() => validateTunnelConfiguration(config)).not.toThrow();
    const noCred = { ...config, authentication: { type: 'credentials' as const } };
    delete noCred.credentialRef;
    expect(() => validateTunnelConfiguration(noCred)).toThrow(/Credential/);
    const noSplit = { ...config, routingMode: 'splitTunnel' as const };
    delete noSplit.splitTunnel;
    expect(() => validateTunnelConfiguration(noSplit)).toThrow(/Split/);
  });
  it('registers providers and enforces resource limits', () => {
    const r = new TunnelProviderRegistry(1);
    r.register(new Provider());
    expect(r.findByCapabilities(['fullTunnel'])).toHaveLength(1);
    expect(() => r.register(new Provider())).toThrow(/limit|Duplicate/);
  });
  it('rejects invalid state transitions', async () => {
    const p = new Provider();
    const t = await p.create(config);
    expect(transitionTunnel(t, 'preparing').state).toBe('preparing');
    expect(() => transitionTunnel(t, 'connected')).toThrow(/Invalid/);
  });
  it('selects explainable policy-compliant tunnels and reports capability mismatch', async () => {
    const p = new Provider();
    const tunnel = await p.create(config);
    const proxy = {
      ...tunnel,
      id: 'proxy-a',
      type: 'proxy' as const,
      capabilities: ['proxyOnly', 'tcp'] as import('./index.js').TunnelCapability[],
      configuration: { ...config, routingMode: 'proxyOnly' as const },
    };
    const result = new TunnelSelector().select({
      candidates: [proxy, tunnel],
      policy: { vpnRequired: true, killSwitchRequired: true },
      routingMode: 'fullTunnel',
      scope: 'system',
      requiredCapabilities: ['fullTunnel'],
      securityProfile: 'strict',
    });
    expect(result.selectedTunnel?.id).toBe('tun-a');
    expect(result.rejectedCandidates[0]?.rejectedReasons.length).toBeGreaterThan(0);
  });
  it('connects, revalidates, reconnects, switches endpoint, disconnects, emits metrics/events and handles concurrency', async () => {
    const seen: string[] = [];
    const events: TunnelEventBus = {
      async publish(e) {
        if (e.type === 'tunnel.connected') seen.push(e.type);
      },
    };
    const metricRows: { name: string }[] = [];
    const metrics = {
      record(name: string) {
        metricRows.push({ name });
      },
    };
    const r = new TunnelProviderRegistry();
    r.register(new Provider());
    const m = new TunnelManager(r, events, metrics);
    await m.configure('provider-a', config);
    const c = await m.connect('tun-a');
    expect(c.state).toBe('connected');
    await expect(
      Promise.all([m.reconnectTunnel('tun-a'), m.disconnectTunnel('tun-a')]),
    ).rejects.toThrow(/Concurrent/);
    const c2 = await m.switchEndpoint('tun-a', { ...endpoint, host: 'vpn2.example.com' });
    expect(c2.tunnelId).toBe('tun-a');
    expect((await m.revalidateTunnel('tun-a')).status).toBe('healthy');
    await m.disconnectTunnel('tun-a');
    expect(seen).toContain('tunnel.connected');
    expect(
      metricRows.some((x: { name: string }) => x.name === 'tunnel_connect_success_total'),
    ).toBe(true);
  });
  it('supports recovery failure injection, simulation, credential redaction, and protocol status honesty', async () => {
    const p = new Provider();
    p.fail = 'auth';
    const r = new TunnelProviderRegistry();
    r.register(p);
    const m = new TunnelManager(r);
    await m.configure('provider-a', config);
    await expect(m.connect('tun-a')).rejects.toMatchObject({
      code: 'TunnelAuthenticationFailed',
      classification: 'securityFailure',
    });
    const tunnel = await new Provider().create(config);
    expect(simulateTunnelConnection(tunnel)).toMatchObject({
      dryRun: true,
      credentials: '[REDACTED]',
    });
    expect(redacted({ privateKey: 'abc', nested: { token: 'def' } })).toEqual({
      privateKey: '[REDACTED]',
      nested: { token: '[REDACTED]' },
    });
    expect(simulateFailover(tunnel, [{ ...tunnel, id: 'tun-b' }], {}).selectedTunnel?.id).toBe(
      'tun-b',
    );
    expect(supportedProtocolStatus.WireGuard).toBe('not implemented');
  });
});
