/**
 * Tests for the Linux gateway-selection composition.
 *
 * The composition is the boundary between the operator's configuration and the canonical gateway
 * selection plane. It must never invent data: without a real tunnel, without an explicitly
 * trusted source and without a destination to verify, no gateway plane is created at all.
 */

import { describe, expect, it } from 'vitest';
import type { ConnectivityManager } from '@irp/connectivity';
import type { RoutingEngine } from '@irp/routing';
import type { TunnelCapability } from '@irp/tunnel';
import type { LinuxWireGuardConfiguration, LinuxWireGuardIntegration } from './linux-wireguard.js';
import {
  createLinuxGatewayEndpointResolver,
  createLinuxGatewaySelectionPlane,
  parseGatewayDestination,
  readLinuxGatewaySelectionEnvironment,
} from './linux-gateway-selection.js';

const wireGuardConfiguration = {
  interfaceName: 'irpwg0',
  credentialRef: 'irp-wireguard-peer-key',
  addressCidr: '10.90.0.2/32',
  endpointHost: '198.51.100.10',
  endpointPort: 51820,
  peerPublicKey: 'k'.repeat(43) + '=',
  allowedIPs: ['198.51.100.0/24'],
  keepaliveSeconds: 25,
  autoConnect: false,
  tunnel: {
    endpoint: {
      host: '198.51.100.10',
      port: 51820,
      protocol: 'wireguard' as const,
      addressFamily: 'ipv4' as const,
      metadata: {},
    },
    routingMode: 'splitTunnel' as const,
    splitTunnel: {
      includedDestinations: ['198.51.100.0/24'],
      excludedDestinations: [],
      precedence: 'include' as const,
    },
    scope: 'system' as const,
    dnsMode: 'resolverDecision' as const,
    authentication: { type: 'key' as const, credentialRef: 'irp-wireguard-peer-key' },
    credentialRef: 'irp-wireguard-peer-key',
    securityProfile: 'strict' as const,
    capabilities: [
      'ipv4',
      'udp',
      'splitRouting',
      'systemWide',
      'authentication',
      'keepalive',
      'reconnect',
      'healthCheck',
      'killSwitch',
    ] as TunnelCapability[],
    keepalive: { enabled: true, intervalMs: 25_000, timeoutMs: 5_000 },
    mtu: { validationStatus: 'unknown' as const },
    timeoutMs: 30_000,
    retryLimit: 1,
  },
};

const integration = {
  configuration: wireGuardConfiguration,
  controlPlane: { configured: true },
} as unknown as LinuxWireGuardIntegration;

const connectivity = {} as ConnectivityManager;
const routing = {} as RoutingEngine;

describe('parseGatewayDestination', () => {
  it('accepts an IPv4 literal with a port', () => {
    expect(parseGatewayDestination('198.51.100.10', '443')).toEqual({
      kind: 'ip',
      value: '198.51.100.10',
      family: 'ipv4',
      port: 443,
    });
  });

  it('accepts an IPv6 literal', () => {
    expect(parseGatewayDestination('2001:db8::1', '8443')).toEqual({
      kind: 'ip',
      value: '2001:db8::1',
      family: 'ipv6',
      port: 8443,
    });
  });

  it('refuses a hostname, because resolving it would depend on the DNS state under change', () => {
    expect(() => parseGatewayDestination('example.test', '443')).toThrow('must be an IP literal');
  });

  it('refuses an invalid port', () => {
    expect(() => parseGatewayDestination('198.51.100.10', '0')).toThrow(
      'must be an integer between 1 and 65535',
    );
    expect(() => parseGatewayDestination('198.51.100.10', 'https')).toThrow(
      'must be an integer between 1 and 65535',
    );
  });

  it('returns nothing when the destination is not configured', () => {
    expect(parseGatewayDestination(undefined, undefined)).toBeUndefined();
    expect(parseGatewayDestination('198.51.100.10', undefined)).toBeUndefined();
  });
});

describe('readLinuxGatewaySelectionEnvironment', () => {
  it('reads the operator configuration', () => {
    const configuration = readLinuxGatewaySelectionEnvironment({
      IRP_GATEWAY_SELECTION_ENABLED: '1',
      IRP_GATEWAY_TRUSTED_SOURCE_IDS: 'linux-host:eth0, linux-host:eth1',
      IRP_GATEWAY_DESTINATION_HOST: '198.51.100.10',
      IRP_GATEWAY_DESTINATION_PORT: '443',
    });

    expect(configuration.enabled).toBe(true);
    expect(configuration.trustedSourceIds).toEqual(['linux-host:eth0', 'linux-host:eth1']);
    expect(configuration.destination?.value).toBe('198.51.100.10');
  });

  it('stays disabled unless it is explicitly enabled', () => {
    expect(readLinuxGatewaySelectionEnvironment({}).enabled).toBe(false);
    expect(
      readLinuxGatewaySelectionEnvironment({ IRP_GATEWAY_SELECTION_ENABLED: 'maybe' }).enabled,
    ).toBe(false);
  });
});

describe('createLinuxGatewaySelectionPlane', () => {
  it('creates no plane without a tunnel', () => {
    expect(
      createLinuxGatewaySelectionPlane(connectivity, {
        trustedSourceIds: ['linux-host:eth0'],
        destination: { kind: 'ip', value: '198.51.100.10', family: 'ipv4' },
        routing,
      }),
    ).toBeUndefined();
  });

  it('creates no plane without an explicitly trusted source', () => {
    expect(
      createLinuxGatewaySelectionPlane(connectivity, {
        tunnel: integration,
        destination: { kind: 'ip', value: '198.51.100.10', family: 'ipv4' },
        routing,
      }),
    ).toBeUndefined();
  });

  it('creates no plane without a destination to verify', () => {
    expect(
      createLinuxGatewaySelectionPlane(connectivity, {
        tunnel: integration,
        trustedSourceIds: ['linux-host:eth0'],
        routing,
      }),
    ).toBeUndefined();
  });

  it('creates a plane that resolves the gateway endpoint from the real tunnel configuration', () => {
    const plane = createLinuxGatewaySelectionPlane(connectivity, {
      tunnel: integration,
      trustedSourceIds: ['linux-host:eth0'],
      destination: { kind: 'ip', value: '198.51.100.10', family: 'ipv4', port: 443 },
      routing,
    });

    expect(plane).toBeDefined();
    expect(plane?.configured).toBe(true);
  });
});

describe('createLinuxGatewayEndpointResolver', () => {
  it('takes the host, the port and the tunnel declaration from the WireGuard configuration', () => {
    const resolution = createLinuxGatewayEndpointResolver(wireGuardConfiguration)({
      sourceId: 'linux-host:eth0',
      providerId: 'linux-host',
      id: 'eth0',
      type: 'ethernet',
      state: 'active',
      addresses: ['10.0.0.2/24'],
      dnsServers: [],
      capabilities: ['monitor'],
      health: {
        score: 80,
        status: 'healthy',
        checkedAt: '2026-01-01T00:00:00.000Z',
      },
      priority: 50,
      metadata: {},
      available: true,
      connected: true,
      active: false,
      preferred: false,
      candidate: true,
      failed: false,
      recovering: false,
      failure: {
        failureCount: 0,
        successCount: 0,
        switchCount: 0,
        recoveryAttempts: 0,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        lastFailure: undefined,
        lastRecovery: undefined,
        failureStartedAt: undefined,
        recentTransitions: [],
      },
    });

    expect(resolution?.host).toBe('198.51.100.10');
    expect(resolution?.port).toBe(51820);
    expect(resolution?.family).toBe('ipv4');
    expect(resolution?.tunnel?.credentialRef).toBe('irp-wireguard-peer-key');
    expect(resolution?.tunnel?.interfaceName).toBe('irpwg0');
    expect(resolution?.tunnel?.allowedDestinations).toEqual(['198.51.100.0/24']);
    expect(resolution?.capabilities?.transports).toEqual(['udp']);
  });
});
