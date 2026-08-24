import { describe, expect, it } from 'vitest';
import {
  assertSecureLifecycleTransition,
  validateProviderCompatibility,
  validateTunnelHealthEvidence,
  withSecureTunnelTimeout,
} from './secure.js';
import type { Endpoint, Tunnel, TunnelConfiguration, TunnelProvider } from './index.js';

const endpoint: Endpoint = {
  host: 'vpn.example.com',
  port: 443,
  protocol: 'custom',
  addressFamily: 'dual',
  metadata: {},
};

const config: TunnelConfiguration = {
  endpoint,
  routingMode: 'fullTunnel',
  scope: 'system',
  dnsMode: 'insideTunnel',
  authentication: { type: 'credentials', credentialRef: 'ref:vpn' },
  credentialRef: 'ref:vpn',
  securityProfile: 'strict',
  capabilities: ['fullTunnel', 'systemWide', 'authentication', 'healthCheck'],
  keepalive: { enabled: true, intervalMs: 30_000, timeoutMs: 5_000 },
  mtu: { configuredMtu: 1420, validationStatus: 'valid' },
  timeoutMs: 30_000,
  retryLimit: 2,
};

const provider: TunnelProvider = {
  id: 'provider-a',
  type: 'vpn',
  protocol: 'custom',
  capabilities: config.capabilities,
  endpoints: [endpoint],
  supportedScopes: ['system'],
  supportedRoutingModes: ['fullTunnel'],
  async healthCheck() {
    throw new Error('not used');
  },
  async create() {
    throw new Error('not used');
  },
  async connect() {
    throw new Error('not used');
  },
  async disconnect() {},
  async destroy() {},
};

const tunnel: Tunnel = {
  id: 'tun-a',
  type: 'vpn',
  providerId: provider.id,
  endpoint,
  state: 'configured',
  capabilities: config.capabilities,
  securityProfile: 'strict',
  configuration: config,
  health: {
    status: 'unknown',
    connectivity: false,
    handshake: false,
    keepalive: false,
    routeReachable: false,
    dnsReachable: false,
    authenticated: false,
    checkedAt: new Date().toISOString(),
    leakProtection: 'unknown',
  },
  metadata: {},
};

describe('phase 48 secure tunnel boundary', () => {
  it('accepts a provider that satisfies protocol, endpoint, scope, routing and capability requirements', () => {
    expect(() => validateProviderCompatibility(provider, config)).not.toThrow();
  });

  it('rejects capability mismatch before provider execution', () => {
    const incompatible = { ...provider, capabilities: ['fullTunnel'] as TunnelProvider['capabilities'] };
    expect(() => validateProviderCompatibility(incompatible, config)).toThrow(/capabilities/);
  });

  it('rejects an endpoint that is not advertised by the provider', () => {
    const incompatible = { ...provider, endpoints: [{ ...endpoint, host: 'other.example.com' }] };
    expect(() => validateProviderCompatibility(incompatible, config)).toThrow(/endpoint/);
  });

  it('enforces a hard timeout and aborts the operation signal', async () => {
    let aborted = false;
    await expect(
      withSecureTunnelTimeout(
        ({ signal }) => new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          });
        }),
        'connect',
        1_000,
      ),
    ).rejects.toThrow('aborted');
    expect(aborted).toBe(true);
  });

  it('rejects timeouts outside the bounded production range', async () => {
    await expect(withSecureTunnelTimeout(async () => 'ok', 'connect', 999)).rejects.toThrow(/between 1000 and 300000/);
    await expect(withSecureTunnelTimeout(async () => 'ok', 'connect', 300_001)).rejects.toThrow(/between 1000 and 300000/);
  });

  it('validates health evidence and rejects future timestamps', () => {
    expect(() => validateTunnelHealthEvidence({
      status: 'healthy',
      connectivity: true,
      handshake: true,
      keepalive: true,
      routeReachable: true,
      dnsReachable: true,
      authenticated: true,
      checkedAt: new Date().toISOString(),
      leakProtection: 'protected',
    })).not.toThrow();

    expect(() => validateTunnelHealthEvidence({
      status: 'healthy',
      connectivity: true,
      handshake: true,
      keepalive: true,
      routeReachable: true,
      dnsReachable: true,
      authenticated: true,
      checkedAt: new Date(Date.now() + 60_000).toISOString(),
      leakProtection: 'protected',
    })).toThrow(/future/);
  });

  it('rejects internally inconsistent healthy evidence', () => {
    expect(() => validateTunnelHealthEvidence({
      status: 'healthy',
      connectivity: false,
      handshake: true,
      keepalive: true,
      routeReachable: true,
      dnsReachable: true,
      authenticated: true,
      checkedAt: new Date().toISOString(),
      leakProtection: 'protected',
    })).toThrow(/inconsistent/);
  });

  it('keeps lifecycle transitions authoritative', () => {
    expect(assertSecureLifecycleTransition(tunnel, 'preparing').state).toBe('preparing');
    expect(() => assertSecureLifecycleTransition(tunnel, 'connected')).toThrow(/Invalid/);
  });
});
