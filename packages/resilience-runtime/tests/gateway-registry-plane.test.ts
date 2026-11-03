import { describe, expect, it, vi } from 'vitest';
import {
  GatewayRegistrySelectionPlane,
  type GatewayRegistrySelectionPlaneOptions,
} from '../src/gateway/gateway-registry-plane.js';
import type { ConnectivityManager } from '@irp/connectivity';
import type {
  GatewayHealthProbe,
  GatewayHealthSample,
  GatewayMetadata,
} from '@irp/gateway-registry';

const mockGateway: GatewayMetadata = {
  id: 'gw-1',
  name: 'Test Gateway',
  endpoint: { host: '10.0.0.1', port: 51820, family: 'ipv4' },
  ownership: { ownerId: 'owner-1', managedBy: 'control-plane' },
  capabilities: {
    tunnelProtocols: ['wireguard'],
    addressFamilies: ['ipv4'],
    transports: ['udp'],
    features: ['health-check'],
  },
  lifecycle: 'active',
  trust: 'trusted',
  tags: ['prod'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockHealth: ConnectivityHealth = {
  score: 90,
  status: 'healthy',
  latencyMs: 25,
  packetLoss: 0,
  checkedAt: '2026-01-01T00:00:00.000Z',
};

const mockSample: GatewayHealthSample = {
  gatewayId: 'gw-1',
  checkedAt: '2026-01-01T00:00:01.000Z',
  reachable: true,
  latencyMs: 25,
  packetLossPercent: 0,
};

// Helper to create a mock ConnectivityManager
const createMockConnectivity = (overrides: Record<string, unknown> = {}): ConnectivityManager => {
  const getHealth = vi.fn().mockResolvedValue(mockHealth);
  const registry = {
    get: vi.fn().mockReturnValue({ getHealth }),
  };

  const base: ConnectivityManager = {
    discoverResources: vi.fn().mockResolvedValue([]),
    getAvailableSources: vi.fn().mockReturnValue([]),
    getActiveSource: vi.fn().mockReturnValue(undefined),
    switchSource: vi.fn().mockResolvedValue(undefined),
    registry,
    getResources: vi.fn().mockReturnValue([]),
    registerProvider: vi.fn().mockResolvedValue(undefined),
    unregisterProvider: vi.fn().mockResolvedValue(undefined),
    getProviders: vi.fn().mockReturnValue([]),
    evaluate: vi.fn().mockResolvedValue({
      current: undefined,
      availableSources: [],
      healthySources: [],
      candidates: [],
      selected: undefined,
      reason: 'no sources',
      policyConstraints: [],
      generatedAt: new Date().toISOString(),
    }),
    selectSource: vi.fn().mockResolvedValue({
      current: undefined,
      availableSources: [],
      healthySources: [],
      candidates: [],
      selected: undefined,
      reason: 'no sources',
      policyConstraints: [],
      generatedAt: new Date().toISOString(),
    }),
    ...overrides,
  };
  return base as unknown as ConnectivityManager;
};

describe('GatewayRegistrySelectionPlane', () => {
  it('constructs with default options', () => {
    const mockConnectivity = createMockConnectivity();
    const plane = new GatewayRegistrySelectionPlane(mockConnectivity);
    expect(plane.configured).toBe(false);
    expect(plane.currentGatewayId).toBeUndefined();
    expect(plane.gateways()).toEqual([]);
  });

  it('constructs with enabled option', () => {
    const mockConnectivity = createMockConnectivity();
    const plane = new GatewayRegistrySelectionPlane(mockConnectivity, {
      enabled: true,
    });
    expect(plane.configured).toBe(true);
  });

  it('synchronize registers gateways from connectivity sources', async () => {
    const mockConnectivity = createMockConnectivity({
      discoverResources: vi.fn().mockResolvedValue([]),
      getAvailableResources: vi.fn().mockReturnValue([]),
    });

    const plane = new GatewayRegistrySelectionPlane(mockConnectivity, {
      enabled: true,
    });
    await plane.synchronize();

    expect(mockConnectivity.discoverResources).toHaveBeenCalled();
  });

  it('evaluate returns no selection when no gateways', async () => {
    const mockConnectivity = createMockConnectivity({
      discoverResources: vi.fn().mockResolvedValue([]),
      getAvailableResources: vi.fn().mockReturnValue([]),
    });

    const plane = new GatewayRegistrySelectionPlane(mockConnectivity, {
      enabled: true,
    });
    const decision = await plane.evaluate();

    expect(decision.selectedGatewayId).toBeUndefined();
    expect(decision.switched).toBe(false);
    expect(decision.candidates).toEqual([]);
  });

  it('probeAndEvaluate throws when no probe is configured', async () => {
    const mockConnectivity = createMockConnectivity({
      discoverResources: vi.fn().mockResolvedValue([]),
      getAvailableResources: vi.fn().mockReturnValue([]),
    });

    const plane = new GatewayRegistrySelectionPlane(mockConnectivity, {
      enabled: true,
    });
    // Register a gateway
    plane['registry'].register(mockGateway);

    await expect(plane.probeAndEvaluate()).rejects.toThrow(
      'GatewayHealthProbe is not configured',
    );
  });

  it('probeAndEvaluate selects the best probed gateway', async () => {
    const mockProbe = {
      probeGateways: vi.fn().mockResolvedValue([mockSample]),
    } as unknown as GatewayHealthProbe;

    const mockConnectivity = createMockConnectivity({
      discoverResources: vi.fn().mockResolvedValue([]),
      getAvailableResources: vi.fn().mockReturnValue([]),
    });

    const plane = new GatewayRegistrySelectionPlane(mockConnectivity, {
      enabled: true,
      probe: mockProbe,
    });
    // Register a gateway
    plane['registry'].register(mockGateway);

    const decision = await plane.probeAndEvaluate();

    expect(mockProbe.probeGateways).toHaveBeenCalled();
    expect(decision.selectedGatewayId).toBe('gw-1');
    expect(decision.candidates.length).toBeGreaterThan(0);
    const selected = decision.candidates.find((c) => c.gatewayId === 'gw-1');
    expect(selected?.eligible).toBe(true);
  });

  it('apply switches connectivity source', async () => {
    const mockConnectivity = createMockConnectivity({
      discoverResources: vi.fn().mockResolvedValue([]),
      getAvailableSources: vi.fn().mockReturnValue([
        {
          sourceId: 'gw-1',
          source: { providerId: 'prov-1', resourceId: 'gw-1' },
          providerId: 'prov-1',
          id: 'gw-1',
          interfaceName: undefined,
          state: 'active',
          addresses: [],
          gateway: '10.0.0.1',
          dnsServers: [],
          capabilities: [],
          health: mockHealth,
          priority: 100,
          metadata: {},
        },
      ]),
      switchSource: vi.fn().mockResolvedValue(undefined),
    });

    const plane = new GatewayRegistrySelectionPlane(mockConnectivity, {
      enabled: true,
    });
    await plane.apply('gw-1');

    expect(mockConnectivity.switchSource).toHaveBeenCalledWith('gw-1');
  });

  it('apply with tunnel control plane establishes tunnel', async () => {
    const mockConnectivity = createMockConnectivity({
      discoverResources: vi.fn().mockResolvedValue([]),
      getAvailableSources: vi.fn().mockReturnValue([
        {
          sourceId: 'gw-1',
          source: { providerId: 'prov-1', resourceId: 'gw-1' },
          providerId: 'prov-1',
          id: 'gw-1',
          interfaceName: undefined,
          state: 'active',
          addresses: [],
          gateway: '10.0.0.1',
          dnsServers: [],
          capabilities: [],
          health: mockHealth,
          priority: 100,
          metadata: {},
        },
      ]),
      switchSource: vi.fn().mockResolvedValue(undefined),
    });

    const mockTunnelPlane = {
      configured: true,
      connect: vi.fn().mockResolvedValue({
        tunnelId: 'tunnel-1',
        providerId: 'prov-1',
        connectionId: 'conn-1',
      }),
    };

    const plane = new GatewayRegistrySelectionPlane(mockConnectivity, {
      enabled: true,
      tunnelControlPlane: mockTunnelPlane,
    });
    // Register a gateway
    plane['registry'].register(mockGateway);

    await plane.apply('gw-1');

    expect(mockTunnelPlane.connect).toHaveBeenCalledWith({
      configuration: {
        endpoint: {
          host: '10.0.0.1',
          port: 51820,
          protocol: 'wireguard',
          addressFamily: 'ipv4',
          metadata: { source: 'gateway-selection', gatewayId: 'gw-1' },
        },
        routingMode: 'fullTunnel',
        scope: 'system',
        dnsMode: 'insideTunnel',
        authentication: { type: 'key', credentialRef: 'wireguard-peer-key' },
        securityProfile: 'secure',
        capabilities: [
          'ipv4', 'ipv6', 'udp', 'fullTunnel', 'systemWide',
          'authentication', 'keepalive', 'reconnect', 'healthCheck', 'killSwitch',
        ],
        keepalive: { enabled: true, intervalMs: 25_000, timeoutMs: 5_000 },
        mtu: { configuredMtu: 1420, validationStatus: 'unknown' },
        timeoutMs: 30_000,
        retryLimit: 1,
        metadata: { gatewayId: 'gw-1' },
      },
    });
  });
});
