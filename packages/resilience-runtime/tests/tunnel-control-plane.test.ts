import { describe, expect, it } from 'vitest';
import {
  TunnelProviderRegistry,
  type Endpoint,
  type Tunnel,
  type TunnelConfiguration,
  type TunnelConnection,
  type TunnelHealth,
  type TunnelProvider,
} from '@irp/tunnel';
import { TunnelRegistryControlPlane } from '../src/tunnel/tunnel-control-plane.js';

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
  capabilities: ['ipv4', 'tcp', 'fullTunnel', 'systemWide', 'authentication', 'healthCheck'],
  keepalive: { enabled: true, intervalMs: 30000, timeoutMs: 5000 },
  mtu: { configuredMtu: 1420, validationStatus: 'valid' },
  timeoutMs: 30000,
  retryLimit: 2,
};

class HealthyProvider implements TunnelProvider {
  readonly id = 'provider-a';
  readonly type = 'vpn' as const;
  readonly protocol = 'custom' as const;
  readonly capabilities = config.capabilities;
  readonly endpoints = [endpoint];
  readonly supportedScopes = ['system' as const];
  readonly supportedRoutingModes = ['fullTunnel' as const];
  async healthCheck(): Promise<TunnelHealth> {
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
  async disconnect(): Promise<void> {}
  async destroy(): Promise<void> {}
}

const buildPlane = (options?: {
  enabled?: boolean;
  providerId?: string;
  configuration?: TunnelConfiguration;
}) => {
  const registry = new TunnelProviderRegistry();
  registry.register(new HealthyProvider());
  const plane = new TunnelRegistryControlPlane(registry, {
    enabled: true,
    providerId: 'provider-a',
    configuration: config,
    ...options,
  });
  return plane;
};

describe('TunnelRegistryControlPlane', () => {
  it('is configured only when enabled with a provider and configuration', () => {
    expect(
      new TunnelRegistryControlPlane(new TunnelProviderRegistry(), { enabled: false }).configured,
    ).toBe(false);
    expect(
      new TunnelRegistryControlPlane(new TunnelProviderRegistry(), {
        enabled: true,
        providerId: 'missing',
        configuration: config,
      }).configured,
    ).toBe(false);
    expect(buildPlane().configured).toBe(true);
  });

  it('connects through the registry-managed provider and verifies health', async () => {
    const plane = buildPlane();
    const connection = await plane.connect();
    expect(connection).toMatchObject({
      tunnelId: 'tun-a',
      providerId: 'provider-a',
      connectionId: 'conn-a',
    });
    expect(plane.activeTunnel).toBe('tun-a');
    await expect(plane.verify('tun-a')).resolves.toBe(true);
  });

  it('fails closed when not configured', async () => {
    const plane = buildPlane({ enabled: false });
    await expect(plane.connect()).rejects.toThrow(/not configured/);
    await expect(plane.verify('tun-a')).resolves.toBe(false);
  });

  it('rolls back by disconnecting the active tunnel', async () => {
    const plane = buildPlane();
    await plane.connect();
    await expect(plane.rollback()).resolves.toBe(true);
    expect(plane.activeTunnel).toBeUndefined();
    await expect(plane.rollback()).resolves.toBe(true);
  });

  it('does not throw on non-existent tunnels for verification', async () => {
    const plane = buildPlane();
    await expect(plane.verify('missing')).resolves.toBe(false);
  });
});
