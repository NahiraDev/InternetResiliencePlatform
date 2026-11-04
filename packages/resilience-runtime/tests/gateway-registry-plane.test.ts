import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  GatewayRegistrySelectionPlane,
  type GatewayEndpointResolution,
  type GatewayRegistrySelectionPlaneOptions,
  type GatewayTrustAttestation,
} from '../src/gateway/gateway-registry-plane.js';
import type { ConnectivityManager, ConnectivitySource } from '@irp/connectivity';
import type {
  GatewayHealthProbe,
  GatewayMetadata,
  GatewaySecurityVerifier,
  GatewayIdentityAttestation,
  GatewayIdentityAttestationPayload,
} from '@irp/gateway-registry';
import { canonicalSecurityPayload, InMemoryGatewayRegistry } from '@irp/gateway-registry';
import type { RoutePlan, RoutingEngine } from '@irp/routing';
import type { CanonicalTunnelControlPlane } from '../src/canonical-network-adapter.js';

const DESTINATION = { kind: 'ip' as const, value: '198.51.100.200', family: 'ipv4' as const };

const mockSource: ConnectivitySource = {
  sourceId: 'gw-1',
  providerId: 'prov-1',
  id: 'gw-1',
  type: 'ethernet',
  state: 'active',
  addresses: ['10.0.0.2'],
  gateway: '10.0.0.1',
  dnsServers: [],
  capabilities: [],
  health: {
    score: 90,
    status: 'healthy',
    latencyMs: 25,
    packetLoss: 0,
    checkedAt: '2026-01-01T00:00:00.000Z',
  },
  priority: 100,
  metadata: {},
  available: true,
};

const resolution: GatewayEndpointResolution = {
  host: '198.51.100.10',
  port: 51820,
  family: 'ipv4',
  tunnel: {
    protocol: 'wireguard',
    credentialRef: 'irp-wireguard-peer-key',
    routingMode: 'splitTunnel',
    addressCidr: '10.90.0.2/32',
    allowedDestinations: ['198.51.100.200/32'],
    interfaceName: 'irpwg0',
    keepaliveSeconds: 25,
  },
  capabilities: { transports: ['udp'], addressFamilies: ['ipv4'] },
  providerId: 'prov-1',
  name: 'WireGuard gateway',
};

const createMockConnectivity = (overrides: Record<string, unknown> = {}): ConnectivityManager => {
  const getHealth = vi.fn().mockResolvedValue({
    score: 90,
    status: 'healthy',
    latencyMs: 25,
    packetLoss: 0,
    checkedAt: '2026-01-01T00:00:00.000Z',
  });
  const registry = { get: vi.fn().mockReturnValue({ getHealth }) };
  const base: ConnectivityManager = {
    discoverResources: vi.fn().mockResolvedValue([]),
    getAvailableSources: vi.fn().mockReturnValue([mockSource]),
    getActiveSource: vi.fn().mockReturnValue(undefined),
    switchSource: vi.fn().mockResolvedValue(undefined),
    registry,
    getResources: vi.fn().mockReturnValue([]),
    registerProvider: vi.fn().mockResolvedValue(undefined),
    unregisterProvider: vi.fn().mockResolvedValue(undefined),
    getProviders: vi.fn().mockReturnValue([]),
    evaluate: vi.fn(),
    selectSource: vi.fn(),
    ...overrides,
  } as unknown as ConnectivityManager;
  return base;
};

const createTunnelPlane = (overrides: Partial<CanonicalTunnelControlPlane> = {}) => {
  const plane = {
    configured: true,
    activeTunnel: undefined as string | undefined,
    managedTunnel: undefined as string | undefined,
    connect: vi.fn().mockResolvedValue({
      tunnelId: 'tunnel-1',
      providerId: 'wireguard',
      connectionId: 'conn-1',
    }),
    verify: vi.fn().mockResolvedValue(true),
    rollback: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as CanonicalTunnelControlPlane & {
    connect: ReturnType<typeof vi.fn>;
    verify: ReturnType<typeof vi.fn>;
    rollback: ReturnType<typeof vi.fn>;
  };
  return plane;
};

const createRouting = (overrides: Partial<Record<string, unknown>> = {}) => {
  const plan = {
    id: 'plan-1',
    destination: DESTINATION,
    candidatePaths: [],
    selectedPath: {
      id: 'path-1',
      type: 'tunnel',
      hops: [],
      route: {
        id: 'route-1',
        destination: '198.51.100.200/32',
        prefix: 32,
        interfaceName: 'irpwg0',
        protocol: 'static',
        metric: 10,
        table: { id: 'main', kind: 'main', name: 'main' },
        family: 'ipv4',
        scope: 'global',
        state: 'active',
        priority: 10,
        capabilities: ['encrypted'],
        metadata: {},
      },
      capabilities: ['encrypted'],
      state: 'active',
      metadata: {},
    },
    reason: 'through the tunnel',
    policy: [],
    actions: [],
    verification: { required: true, timeoutMs: 5_000, strategy: 'provider', status: 'succeeded' },
    explanation: {
      matchedRouteIds: [],
      eligibleCandidateIds: [],
      rejected: [],
      policy: [],
      scores: {},
      reason: '',
      precedence: [],
    },
    dryRun: false,
    createdAt: new Date().toISOString(),
  } as unknown as RoutePlan;
  const routing = {
    applyPlan: vi.fn().mockResolvedValue(plan),
    rollbackPlan: vi.fn().mockResolvedValue(true),
    confirmPlan: vi.fn().mockResolvedValue(true),
    verifyRollback: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as RoutingEngine & {
    applyPlan: ReturnType<typeof vi.fn>;
    rollbackPlan: ReturnType<typeof vi.fn>;
    confirmPlan: ReturnType<typeof vi.fn>;
  };
  return routing;
};

const createVerifyDestination = (status: 'reachable' | 'degraded' | 'failed' | 'unknown' = 'reachable') =>
  vi.fn().mockResolvedValue({
    status,
    latencyMs: 12,
    service: '198.51.100.200:443',
    ...(status === 'reachable' ? {} : { reason: 'not reachable' }),
  });

const baseOptions = (
  overrides: Partial<GatewayRegistrySelectionPlaneOptions> = {},
): GatewayRegistrySelectionPlaneOptions => ({
  enabled: true,
  endpointResolver: () => resolution,
  trustedGatewayIds: ['gw-1'],
  tunnelControlPlane: createTunnelPlane(),
  routing: createRouting(),
  verifyDestination: createVerifyDestination(),
  destination: DESTINATION,
  ...overrides,
});

describe('GatewayRegistrySelectionPlane — trust and endpoint resolution', () => {
  it('registers a gateway with the resolved endpoint and keeps it pending until trust is established', async () => {
    const plane = new GatewayRegistrySelectionPlane(createMockConnectivity(), {
      enabled: true,
      endpointResolver: () => resolution,
    });

    await plane.synchronize();

    const registered = plane['registry'].list();
    expect(registered).toHaveLength(1);
    expect(registered[0]?.trust).toBe('pending');
    expect(registered[0]?.endpoint).toEqual({
      host: '198.51.100.10',
      port: 51820,
      family: 'ipv4',
    });
    expect(registered[0]?.tunnel?.credentialRef).toBe('irp-wireguard-peer-key');
    // A pending gateway is not offered for selection.
    expect(plane.gateways()).toEqual([]);
  });

  it('never invents a host, a port or an address family for a source without a real endpoint', async () => {
    const plane = new GatewayRegistrySelectionPlane(createMockConnectivity(), {
      enabled: true,
      endpointResolver: () => undefined,
    });

    await plane.synchronize();

    expect(plane['registry'].list()).toEqual([]);
    expect(plane.unaddressableSources()['gw-1']).toContain('no real tunnel endpoint');
  });

  it('promotes a gateway to trusted when the operator allow-list names it', async () => {
    const plane = new GatewayRegistrySelectionPlane(
      createMockConnectivity(),
      baseOptions({ trustedGatewayIds: ['gw-1'] }),
    );

    await plane.synchronize();

    expect(plane['registry'].get('gw-1')?.trust).toBe('trusted');
    expect(plane.gateways().map((gateway) => gateway.id)).toEqual(['gw-1']);
  });

  it('establishes trust from a canonical attestation', async () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const payload: GatewayIdentityAttestationPayload = {
      gatewayId: 'gw-1',
      providerId: 'prov-1',
      keyId: 'key-1',
      algorithm: 'ed25519',
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      nonce: 'nonce-1',
    };
    const identity: GatewayIdentityAttestation = {
      payload,
      signature: sign(null, Buffer.from(canonicalSecurityPayload(payload)), privateKey).toString(
        'base64',
      ),
    };
    const verifyingVerifier = {
      assess: vi.fn().mockReturnValue({
        gatewayId: 'gw-1',
        identityVerified: true,
        artifactVerified: false,
        assessedAt: new Date().toISOString(),
        identityKeyId: 'key-1',
      }),
    } as unknown as GatewaySecurityVerifier;

    const plane = new GatewayRegistrySelectionPlane(createMockConnectivity(), {
      enabled: true,
      endpointResolver: () => resolution,
      securityVerifier: verifyingVerifier,
      attestations: (): GatewayTrustAttestation => ({ identity }),
    });

    await plane.synchronize();

    expect(verifyingVerifier.assess).toHaveBeenCalled();
    expect(plane['registry'].get('gw-1')?.trust).toBe('trusted');
  });

  it('marks a gateway untrusted when the canonical attestation is rejected', async () => {
    const identity = { payload: {} as never, signature: 'bad' };
    const rejectingVerifier = {
      assess: vi.fn(() => {
        throw new Error('signature verification failed');
      }),
    } as unknown as GatewaySecurityVerifier;

    const plane = new GatewayRegistrySelectionPlane(createMockConnectivity(), {
      enabled: true,
      endpointResolver: () => resolution,
      securityVerifier: rejectingVerifier,
      attestations: (): GatewayTrustAttestation => ({ identity }),
    });

    await plane.synchronize();

    expect(plane['registry'].get('gw-1')?.trust).toBe('untrusted');
    expect(plane.gateways()).toEqual([]);
  });
});

describe('GatewayRegistrySelectionPlane — evaluation', () => {
  it('does not throw and selects nothing when no probe is configured', async () => {
    const plane = new GatewayRegistrySelectionPlane(createMockConnectivity(), baseOptions());

    await plane.synchronize();
    const decision = await plane.probeAndEvaluate();

    expect(decision.selectedGatewayId).toBeUndefined();
    expect(decision.switched).toBe(false);
    expect(decision.reason).toContain('no health probe is configured');
  });

  it('never reports a gateway as operational from transport evidence alone', async () => {
    const probe: GatewayHealthProbe = {
      probe: vi.fn().mockResolvedValue({ reachable: true, evidence: 'transport', latencyMs: 5 }),
      probeGateways: vi.fn().mockResolvedValue([
        {
          gatewayId: 'gw-1',
          checkedAt: new Date().toISOString(),
          reachable: true,
          evidence: 'transport',
          latencyMs: 5,
          packetLossPercent: 0,
        },
      ]),
    };
    const plane = new GatewayRegistrySelectionPlane(
      createMockConnectivity(),
      baseOptions({ probe }),
    );

    await plane.synchronize();
    const decision = await plane.probeAndEvaluate();

    // The decision is a plan: it carries transport evidence only.
    expect(decision.evidence).toBe('transport');
    const candidate = decision.candidates.find((item) => item.gatewayId === 'gw-1');
    expect(candidate?.eligible).toBe(true);
  });

  it('does not use a TCP probe against a UDP-only gateway', async () => {
    const probe: GatewayHealthProbe = {
      transport: 'tcp',
      probe: vi.fn(),
      probeGateways: vi.fn(),
    };
    const plane = new GatewayRegistrySelectionPlane(
      createMockConnectivity(),
      baseOptions({ probe }),
    );

    await plane.synchronize();
    await plane.probeAndEvaluate();

    expect(probe.probeGateways).not.toHaveBeenCalled();
  });

  it('reports that no trusted gateway exists when trust was never established', async () => {
    const plane = new GatewayRegistrySelectionPlane(createMockConnectivity(), {
      enabled: true,
      endpointResolver: () => resolution,
    });

    await plane.synchronize();
    const decision = await plane.probeAndEvaluate();

    expect(decision.selectedGatewayId).toBeUndefined();
    expect(decision.reason).toContain('awaiting a canonical attestation');
  });
});

describe('GatewayRegistrySelectionPlane — establishment', () => {
  const setup = async (options: Partial<GatewayRegistrySelectionPlaneOptions> = {}) => {
    const connectivity = createMockConnectivity();
    const plane = new GatewayRegistrySelectionPlane(connectivity, baseOptions(options));
    await plane.synchronize();
    return { connectivity, plane };
  };

  it('establishes the tunnel, installs the route, verifies the destination and switches the source', async () => {
    const tunnelPlane = createTunnelPlane();
    const routing = createRouting();
    const verifyDestination = createVerifyDestination();
    const { connectivity, plane } = await setup({
      tunnelControlPlane: tunnelPlane,
      routing,
      verifyDestination,
    });

    const receipt = await plane.apply('gw-1');

    expect(tunnelPlane.connect).toHaveBeenCalledTimes(1);
    const configuration = tunnelPlane.connect.mock.calls[0]?.[0]?.configuration;
    expect(configuration?.endpoint.host).toBe('198.51.100.10');
    expect(configuration?.endpoint.port).toBe(51820);
    expect(configuration?.endpoint.protocol).toBe('wireguard');
    expect(configuration?.authentication.credentialRef).toBe('irp-wireguard-peer-key');
    expect(JSON.stringify(configuration)).not.toContain('"credentialRef":"wireguard-peer-key"');
    expect(tunnelPlane.verify).toHaveBeenCalledWith('tunnel-1');
    expect(routing.applyPlan).toHaveBeenCalledTimes(1);
    expect(verifyDestination).toHaveBeenCalledWith(DESTINATION, expect.anything());
    expect(connectivity.switchSource).toHaveBeenCalledWith('gw-1');
    expect(receipt.egressVerified).toBe(true);
    expect(receipt.tunnelId).toBe('tunnel-1');
  });

  it('refuses to establish a gateway that is not trusted', async () => {
    const { plane } = await setup({ trustedGatewayIds: [] });
    await expect(plane.apply('gw-1')).rejects.toThrow('is not trusted');
  });

  it('refuses to establish a gateway without a tunnel declaration', async () => {
    const { plane } = await setup({
      endpointResolver: () => ({ ...resolution, tunnel: undefined }),
    });
    await expect(plane.apply('gw-1')).rejects.toThrow('declares no tunnel');
  });

  it('refuses to invent a credential reference', async () => {
    const plane = new GatewayRegistrySelectionPlane(
      createMockConnectivity(),
      baseOptions({
        endpointResolver: () => ({
          ...resolution,
          tunnel: { ...resolution.tunnel!, credentialRef: '' },
        }),
      }),
    );
    await expect(plane.synchronize()).rejects.toThrow('credentialRef is required');
  });

  it('refuses to establish a gateway without a tunnel control plane', async () => {
    const { plane } = await setup({ tunnelControlPlane: undefined });
    await expect(plane.apply('gw-1')).rejects.toThrow('no tunnel control plane');
  });

  it('refuses to establish a gateway without a destination to verify', async () => {
    const { plane } = await setup({ destination: undefined });
    await expect(plane.apply('gw-1')).rejects.toThrow('no external destination is configured');
  });

  it('refuses to establish a gateway without a destination verifier', async () => {
    const { plane } = await setup({ verifyDestination: undefined });
    await expect(plane.apply('gw-1')).rejects.toThrow('no destination verifier is configured');
  });

  it('refuses to establish a gateway without a routing engine', async () => {
    const { plane } = await setup({ routing: undefined });
    await expect(plane.apply('gw-1')).rejects.toThrow('no routing engine is configured');
  });

  it('rolls back when the tunnel cannot be established', async () => {
    const tunnelPlane = createTunnelPlane({
      connect: vi.fn().mockRejectedValue(new Error('wg set failed: no such device')),
    });
    const routing = createRouting();
    const { connectivity, plane } = await setup({ tunnelControlPlane: tunnelPlane, routing });

    await expect(plane.apply('gw-1')).rejects.toThrow('wg set failed');

    expect(routing.applyPlan).not.toHaveBeenCalled();
    expect(connectivity.switchSource).not.toHaveBeenCalled();
    expect(tunnelPlane.rollback).toHaveBeenCalled();
  });

  it('rolls back when the tunnel does not pass its protocol health check', async () => {
    const tunnelPlane = createTunnelPlane({ verify: vi.fn().mockResolvedValue(false) });
    const routing = createRouting();
    const { connectivity, plane } = await setup({ tunnelControlPlane: tunnelPlane, routing });

    await expect(plane.apply('gw-1')).rejects.toThrow('protocol health check');

    expect(routing.applyPlan).not.toHaveBeenCalled();
    expect(connectivity.switchSource).not.toHaveBeenCalled();
    expect(tunnelPlane.rollback).toHaveBeenCalled();
  });

  it('rolls back the route and the tunnel when the route cannot be verified', async () => {
    const tunnelPlane = createTunnelPlane();
    const failedPlan = {
      id: 'plan-failed',
      verification: { required: true, timeoutMs: 5_000, strategy: 'provider', status: 'failed' },
    } as unknown as RoutePlan;
    const routing = createRouting({ applyPlan: vi.fn().mockResolvedValue(failedPlan) });
    const { connectivity, plane } = await setup({ tunnelControlPlane: tunnelPlane, routing });

    await expect(plane.apply('gw-1')).rejects.toThrow('route through gateway gw-1 was not verified');

    expect(connectivity.switchSource).not.toHaveBeenCalled();
    expect(routing.rollbackPlan).toHaveBeenCalled();
    expect(tunnelPlane.rollback).toHaveBeenCalled();
  });

  it('rolls back everything when the external destination is not reached', async () => {
    const tunnelPlane = createTunnelPlane();
    const routing = createRouting();
    const verifyDestination = createVerifyDestination('failed');
    const { connectivity, plane } = await setup({
      tunnelControlPlane: tunnelPlane,
      routing,
      verifyDestination,
    });

    await expect(plane.apply('gw-1')).rejects.toThrow('was not reached through gateway gw-1');

    expect(connectivity.switchSource).not.toHaveBeenCalled();
    expect(routing.rollbackPlan).toHaveBeenCalled();
    expect(tunnelPlane.rollback).toHaveBeenCalled();
  });

  it('rolls back when the source switch itself fails', async () => {
    const tunnelPlane = createTunnelPlane();
    const routing = createRouting();
    const connectivity = createMockConnectivity({
      switchSource: vi.fn().mockRejectedValue(new Error('switch refused')),
    });
    const plane = new GatewayRegistrySelectionPlane(
      connectivity,
      baseOptions({ tunnelControlPlane: tunnelPlane, routing }),
    );
    await plane.synchronize();

    await expect(plane.apply('gw-1')).rejects.toThrow('switch refused');

    expect(routing.rollbackPlan).toHaveBeenCalled();
    expect(tunnelPlane.rollback).toHaveBeenCalled();
  });

  it('reverts the source switch, the route and the tunnel on an explicit rollback', async () => {
    const tunnelPlane = createTunnelPlane();
    const routing = createRouting();
    const connectivity = createMockConnectivity({
      getActiveSource: vi.fn().mockReturnValue({ ...mockSource, sourceId: 'gw-0' }),
    });
    const plane = new GatewayRegistrySelectionPlane(
      connectivity,
      baseOptions({ tunnelControlPlane: tunnelPlane, routing }),
    );
    await plane.synchronize();

    await plane.apply('gw-1');
    const rolledBack = await plane.rollback('gw-1');

    expect(rolledBack).toBe(true);
    expect(connectivity.switchSource).toHaveBeenCalledWith('gw-0');
    expect(routing.rollbackPlan).toHaveBeenCalled();
    expect(tunnelPlane.rollback).toHaveBeenCalled();
  });

  it('reuses a proven tunnel instead of establishing a second one', async () => {
    const tunnelPlane = createTunnelPlane();
    const routing = createRouting();
    const { plane } = await setup({ tunnelControlPlane: tunnelPlane, routing });

    await plane.apply('gw-1');
    await plane.apply('gw-1');

    expect(tunnelPlane.connect).toHaveBeenCalledTimes(1);
    expect(routing.applyPlan).toHaveBeenCalledTimes(1);
  });
});

describe('GatewayRegistrySelectionPlane — gateway metadata contract', () => {
  it('rejects a gateway whose tunnel declaration has no protocol', () => {
    expect(() =>
      new InMemoryGatewayRegistry().register({
        id: 'gw-bad',
        name: 'bad',
        endpoint: { host: '198.51.100.11', port: 51820, family: 'ipv4' },
        ownership: { ownerId: 'owner-1', managedBy: 'provider' },
        capabilities: {
          tunnelProtocols: ['wireguard'],
          addressFamilies: ['ipv4'],
          transports: ['udp'],
          features: [],
        },
        tunnel: {
          protocol: '',
          credentialRef: 'cred',
          routingMode: 'splitTunnel',
        },
        lifecycle: 'active',
        trust: 'pending',
        tags: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toThrow('protocol is required');
  });

  it('rejects a gateway whose tunnel declaration has no credential reference', () => {
    expect(() =>
      new InMemoryGatewayRegistry().register({
        id: 'gw-bad',
        name: 'bad',
        endpoint: { host: '198.51.100.11', port: 51820, family: 'ipv4' },
        ownership: { ownerId: 'owner-1', managedBy: 'provider' },
        capabilities: {
          tunnelProtocols: ['wireguard'],
          addressFamilies: ['ipv4'],
          transports: ['udp'],
          features: [],
        },
        tunnel: {
          protocol: 'wireguard',
          credentialRef: '',
          routingMode: 'splitTunnel',
        },
        lifecycle: 'active',
        trust: 'pending',
        tags: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toThrow('credentialRef is required');
  });
});
