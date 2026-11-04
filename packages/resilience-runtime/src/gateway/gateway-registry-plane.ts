import type { ConnectivityHealth, ConnectivityManager, ConnectivitySource } from '@irp/connectivity';
import {
  InMemoryGatewayRegistry,
  selectGateway,
  type GatewayAddressFamily,
  type GatewayCapabilities,
  type GatewayCapacity,
  type GatewayEndpoint,
  type GatewayHealth,
  type GatewayHealthProbe,
  type GatewayHealthSample,
  type GatewayMetadata,
  type GatewayProbeEvidence,
  type GatewaySelectionPolicy,
  type GatewaySecurityVerifier,
  type GatewayIdentityAttestation,
  type GatewayArtifactAttestation,
  type GatewayTunnelDeclaration,
} from '@irp/gateway-registry';
import type { RoutingDestination, RoutingEngine, RoutePlan } from '@irp/routing';
import type { TunnelCapability, TunnelConfiguration, TunnelProtocol } from '@irp/tunnel';
import { isDefined, nowIso } from '@irp/utils';
import type {
  CanonicalDestinationOutcome,
  CanonicalGatewayApplyResult,
  CanonicalGatewaySelectionCandidate,
  CanonicalGatewaySelectionDecision,
  CanonicalGatewaySelectionPlane,
  CanonicalTunnelControlPlane,
} from '../canonical-network-adapter.js';
import type { RuntimeContext } from '../domain/types.js';

/**
 * A real, addressable tunnel endpoint for a connectivity source.
 *
 * The resolver is the only place where a gateway's host and port may come from. When it returns
 * `undefined` the source is not addressable as a gateway and is not registered at all: the
 * selection plane never invents a host, a port or an address family.
 */
export interface GatewayEndpointResolution {
  readonly host: string;
  readonly port: number;
  readonly family: GatewayAddressFamily;
  /** How traffic reaches the gateway. Required for the gateway to be tunnel-addressable. */
  readonly tunnel?: GatewayTunnelDeclaration;
  readonly capabilities?: Partial<GatewayCapabilities>;
  readonly providerId?: string;
  readonly region?: string;
  readonly name?: string;
  readonly tags?: readonly string[];
}

export type GatewayEndpointResolver = (
  source: ConnectivitySource,
) => GatewayEndpointResolution | undefined;

/** The attestation material used to establish a gateway's trust. */
export interface GatewayTrustAttestation {
  readonly identity: GatewayIdentityAttestation;
  readonly artifact?: {
    readonly attestation: GatewayArtifactAttestation;
    readonly bytes: Uint8Array;
  };
}

export interface GatewayRegistrySelectionPlaneOptions {
  enabled?: boolean;
  policy?: Partial<GatewaySelectionPolicy>;
  probe?: GatewayHealthProbe;
  tunnelControlPlane?: CanonicalTunnelControlPlane;
  /** The canonical routing engine used to install the route through the tunnel. */
  routing?: RoutingEngine;
  /** The canonical destination probe used to prove that traffic leaves through the tunnel. */
  verifyDestination?: (
    destination: RoutingDestination,
    context: RuntimeContext,
  ) => Promise<CanonicalDestinationOutcome>;
  /** The external destination that must be reached through the selected gateway. */
  destination?: RoutingDestination;
  /** Resolves the real endpoint of a connectivity source. */
  endpointResolver?: GatewayEndpointResolver;
  /** Gateways an operator explicitly trusts, by id. */
  trustedGatewayIds?: readonly string[];
  /** The canonical verifier used to establish trust from an attestation. */
  securityVerifier?: GatewaySecurityVerifier;
  /** Resolves the attestation material for a gateway. */
  attestations?: (gatewayId: string) => GatewayTrustAttestation | undefined;
}

interface GatewayApplication {
  readonly gatewayId: string;
  readonly tunnelId: string;
  readonly routePlan?: RoutePlan;
  readonly previousSourceId: string | undefined;
  readonly destination: RoutingDestination | undefined;
  readonly verifiedAt: string;
}

const DEFAULT_PROBE_TIMEOUT_MS = 5_000;
const TRANSPORT_EVIDENCE: GatewayProbeEvidence = 'transport';

const TUNNEL_PROTOCOLS: readonly TunnelProtocol[] = [
  'wireguard',
  'openvpn',
  'socks5',
  'http-connect',
  'https-proxy',
  'ssh',
  'quic',
  'custom',
];

/**
 * Maps a declared gateway protocol onto the canonical tunnel protocol vocabulary.
 *
 * An unsupported protocol fails closed: the plane never guesses a protocol.
 */
function toTunnelProtocol(protocol: string): TunnelProtocol {
  const normalized = protocol.trim().toLowerCase();
  const match = TUNNEL_PROTOCOLS.find((candidate) => candidate === normalized);
  if (!match) throw new Error(`unsupported tunnel protocol '${protocol}'`);
  return match;
}

const deriveGatewayHealth = (gatewayId: string, health: ConnectivityHealth): GatewayHealth => ({
  gatewayId,
  status:
    health.status === 'unhealthy'
      ? 'unreachable'
      : health.status === 'healthy'
        ? 'degraded'
        : health.status === 'degraded'
          ? 'degraded'
          : 'unknown',
  score: Number.isFinite(health.score) ? health.score : 0,
  checkedAt: health.checkedAt,
  // Connectivity-source health is local-link evidence. Selecting a source says nothing about the
  // gateway's tunnel protocol or its egress, so it can never be more than transport evidence.
  evidence: TRANSPORT_EVIDENCE,
  ...(health.latencyMs === undefined ? {} : { latencyMs: health.latencyMs }),
  ...(health.packetLoss === undefined ? {} : { packetLossPercent: health.packetLoss }),
  reason: 'derived from connectivity source health evidence; the tunnel and egress are unproven',
});

const deriveGatewayHealthFromProbe = (
  gatewayId: string,
  sample: GatewayHealthSample,
): GatewayHealth => {
  const evidence = sample.evidence ?? TRANSPORT_EVIDENCE;
  const score = sample.reachable
    ? sample.latencyMs !== undefined
      ? Math.max(
          0,
          Math.min(100, 100 - (sample.latencyMs - 20) * 0.5 - (sample.packetLossPercent ?? 0) * 10),
        )
      : 70
    : 0;
  const status = !sample.reachable
    ? 'unreachable'
    : evidence === TRANSPORT_EVIDENCE
      ? // A reachable transport is not an operational gateway.
        'degraded'
      : score >= 80
        ? 'healthy'
        : 'degraded';
  return {
    gatewayId,
    status,
    score: evidence === TRANSPORT_EVIDENCE ? Math.min(score, 79) : score,
    checkedAt: new Date().toISOString(),
    evidence,
    ...(sample.latencyMs === undefined ? {} : { latencyMs: sample.latencyMs }),
    ...(sample.packetLossPercent === undefined ? {} : { packetLossPercent: sample.packetLossPercent }),
    reason:
      evidence === TRANSPORT_EVIDENCE
        ? 'derived from a direct transport probe; the tunnel protocol and egress are unproven'
        : `derived from a direct ${evidence} probe`,
  };
};

const familyFor = (endpoint: GatewayEndpoint): GatewayAddressFamily => endpoint.family;

/**
 * The gateway selection data plane.
 *
 * It sits behind the canonical runtime: it holds no decision authority, it only turns gateway
 * evidence into a selection and carries out the resulting data-plane transition inside the
 * runtime's transaction boundary.
 *
 * The invariants it enforces:
 *
 * - a gateway is registered only when a real host and port are known;
 * - a newly registered gateway is `pending` and becomes `trusted` only through a canonical
 *   attestation or an explicit operator allow-list;
 * - transport evidence alone never makes a gateway operational;
 * - a gateway is only reported as established after the tunnel is up, the route is installed and
 *   an external destination has actually been reached through the tunnel;
 * - any failure after the first mutation is rolled back.
 */
export class GatewayRegistrySelectionPlane implements CanonicalGatewaySelectionPlane {
  private readonly registry = new InMemoryGatewayRegistry();
  private readonly policy: Partial<GatewaySelectionPolicy>;
  private readonly applications = new Map<string, GatewayApplication>();
  private readonly unaddressable = new Map<string, string>();

  constructor(
    private readonly connectivity: ConnectivityManager,
    private readonly options: GatewayRegistrySelectionPlaneOptions = {},
  ) {
    this.policy = options.policy ?? {};
  }

  get configured(): boolean {
    return this.options.enabled === true;
  }

  get currentGatewayId(): string | undefined {
    return this.connectivity.getActiveSource()?.sourceId;
  }

  gateways(): readonly GatewayMetadata[] {
    return this.registry.list({ lifecycle: 'active', trust: 'trusted' });
  }

  /** Sources that could not be registered because no real endpoint is known for them. */
  unaddressableSources(): Readonly<Record<string, string>> {
    return Object.fromEntries(this.unaddressable);
  }

  async synchronize(): Promise<void> {
    await this.connectivity.discoverResources();
    const sources = this.connectivity.getAvailableSources();
    for (const source of sources) {
      const existing = this.registry.get(source.sourceId);
      if (existing) {
        this.refreshLifecycle(existing, source);
        continue;
      }
      const resolution = this.options.endpointResolver?.(source);
      if (!resolution) {
        this.unaddressable.set(
          source.sourceId,
          'no real tunnel endpoint is known for this connectivity source',
        );
        continue;
      }
      const endpoint = this.assertResolution(resolution, source.sourceId);
      this.unaddressable.delete(source.sourceId);
      const gateway: GatewayMetadata = {
        id: source.sourceId,
        name: resolution.name ?? source.providerId,
        description: 'gateway derived from a connectivity source with a declared tunnel endpoint',
        ...(resolution.providerId ?? source.providerId
          ? { providerId: resolution.providerId ?? source.providerId }
          : {}),
        ...(resolution.region ? { region: resolution.region } : {}),
        endpoint,
        ownership: { ownerId: source.providerId, managedBy: 'control-plane' as const },
        capabilities: {
          tunnelProtocols: resolution.tunnel ? [resolution.tunnel.protocol] : [],
          addressFamilies: resolution.capabilities?.addressFamilies ?? [familyFor(endpoint)],
          transports: resolution.capabilities?.transports ?? [],
          features: resolution.capabilities?.features ?? [],
        },
        ...(resolution.tunnel ? { tunnel: resolution.tunnel } : {}),
        lifecycle: source.available ? 'active' : 'disabled',
        // Trust is never granted by discovery. It is established by attestation or by an
        // explicit operator allow-list.
        trust: 'pending',
        tags: [...(resolution.tags ?? [source.providerId])],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      this.registry.register(gateway);
      this.establishTrust(gateway);
    }
  }

  private assertResolution(
    resolution: GatewayEndpointResolution,
    sourceId: string,
  ): GatewayEndpoint {
    const host = resolution.host?.trim() ?? '';
    if (!host) {
      throw new Error(`gateway endpoint resolution for ${sourceId} has no host`);
    }
    if (!Number.isInteger(resolution.port) || resolution.port < 1 || resolution.port > 65535) {
      throw new Error(
        `gateway endpoint resolution for ${sourceId} has an invalid port: ${String(resolution.port)}`,
      );
    }
    return { host, port: resolution.port, family: resolution.family };
  }

  private refreshLifecycle(gateway: GatewayMetadata, source: ConnectivitySource): void {
    const wanted = source.available ? 'active' : 'disabled';
    if (gateway.lifecycle === wanted) return;
    if (gateway.lifecycle === 'retired' || gateway.lifecycle === 'draining') return;
    this.registry.transition(gateway.id, wanted);
  }

  /**
   * Establishes a gateway's trust.
   *
   * A gateway is trusted only when the canonical verifier accepts its attestation, or when an
   * operator explicitly allow-listed it. A failed attestation marks the gateway `untrusted`.
   */
  private establishTrust(gateway: GatewayMetadata): void {
    if (this.options.trustedGatewayIds?.includes(gateway.id)) {
      this.registry.setTrust(gateway.id, 'trusted');
      return;
    }
    const verifier = this.options.securityVerifier;
    const attestation = this.options.attestations?.(gateway.id);
    if (!verifier || !attestation) return;
    try {
      const assessment = verifier.assess(
        gateway,
        attestation.identity,
        attestation.artifact,
      );
      if (assessment.identityVerified) this.registry.setTrust(gateway.id, 'trusted');
    } catch {
      this.registry.setTrust(gateway.id, 'untrusted');
    }
  }

  /**
   * Probes the registered gateways and ranks them.
   *
   * The probe only produces transport evidence. That evidence is enough to reject dead endpoints
   * and to rank candidates, but it never makes a gateway operational: the operational proof is
   * the tunnel establishment, the route installation and the external destination verification
   * performed by {@link apply}.
   */
  async probeAndEvaluate(): Promise<CanonicalGatewaySelectionDecision> {
    const gateways = this.gateways();
    if (gateways.length === 0) {
      return {
        selectedGatewayId: undefined,
        switched: false,
        reason: this.noGatewayReason(),
        candidates: [],
      };
    }

    const probe = this.options.probe;
    const health = new Map<string, GatewayHealth>();
    const samples: GatewayHealthSample[] = [];

    if (probe) {
      const applicable = gateways.filter((gateway) => this.probeApplies(probe, gateway));
      if (applicable.length > 0) {
        const probeGatewaysFn = probe.probeGateways;
        const collected = probeGatewaysFn
          ? await probeGatewaysFn.call(probe, applicable.map((g) => ({ id: g.id, endpoint: g.endpoint })))
          : await Promise.all(
              applicable.map(async (gateway) => ({
                gatewayId: gateway.id,
                checkedAt: new Date().toISOString(),
                reachable: false,
                evidence: TRANSPORT_EVIDENCE,
                applicable: false,
              })),
            );
        samples.push(...collected);
        for (const sample of collected) {
          health.set(sample.gatewayId, deriveGatewayHealthFromProbe(sample.gatewayId, sample));
        }
      }
    }

    for (const gateway of gateways) {
      if (health.has(gateway.id)) continue;
      health.set(gateway.id, {
        gatewayId: gateway.id,
        status: 'unknown',
        score: 0,
        checkedAt: new Date().toISOString(),
        evidence: TRANSPORT_EVIDENCE,
        reason: probe
          ? 'the configured probe cannot speak this gateway transport; no transport evidence was gathered'
          : 'no health probe is configured; no gateway can be proven from source selection alone',
      });
    }

    const capacity = new Map<string, GatewayCapacity>();
    const result = selectGateway({
      gateways: [...gateways],
      health: Object.fromEntries(health),
      capacity: Object.fromEntries(capacity),
      ...(this.currentGatewayId === undefined ? {} : { currentGatewayId: this.currentGatewayId }),
      policy: {
        ...this.policy,
        // Ranking may use degraded transport evidence; the operational gate is the establishment
        // performed by apply(), not the ranking.
        allowDegradedHealth: true,
      },
    });

    const candidates: CanonicalGatewaySelectionCandidate[] = result.candidates.map((candidate) => ({
      gatewayId: candidate.gateway.id,
      eligible: candidate.eligible,
      score: candidate.score,
      explanation: candidate.explanation,
      ...(candidate.rejectionReason === undefined
        ? {}
        : { rejectionReason: candidate.rejectionReason }),
    }));

    const selected = result.selected;
    if (!selected) {
      return {
        selectedGatewayId: undefined,
        switched: false,
        reason: this.selectionFailureReason(result.reason, result.candidates),
        candidates,
        evidence: TRANSPORT_EVIDENCE,
      };
    }

    return {
      selectedGatewayId: selected.gateway.id,
      switched: result.switched,
      reason: `${result.reason} The gateway still has to be established, routed and verified against an external destination before it is operational.`,
      candidates,
      evidence: TRANSPORT_EVIDENCE,
    };
  }

  /** True when the configured probe can speak the gateway's declared transport. */
  private probeApplies(probe: GatewayHealthProbe, gateway: GatewayMetadata): boolean {
    const transport = probe.transport;
    if (!transport || transport === 'any') return true;
    const declared = gateway.capabilities.transports.map((value) => value.toLowerCase());
    if (declared.length === 0) return true;
    return declared.includes(transport);
  }

  /**
   * Explains why no gateway could be selected, including the evidence that was missing.
   *
   * The explanation must name the reason, because "nothing was selected" and "something was
   * selected but could not be proven" are different operational outcomes.
   */
  private selectionFailureReason(
    reason: string,
    candidates: readonly {
      gateway: { id: string };
      rejectionReason?: string;
      explanation: readonly string[];
      health?: { reason?: string };
    }[],
  ): string {
    if (candidates.length === 0) return reason;
    const details = candidates
      .map((candidate) => {
        const why = candidate.rejectionReason ?? 'no operational evidence';
        const explanation = candidate.explanation.join(' ');
        const health = candidate.health?.reason;
        const detail = [health, explanation].filter(Boolean).join(' — ');
        return `${candidate.gateway.id}: ${why}${detail ? ` (${detail})` : ''}`;
      })
      .join('; ');
    return `${reason} ${details}`;
  }

  private noGatewayReason(): string {
    const pending = this.registry.list({ trust: 'pending' });
    const unaddressable = this.unaddressable.size;
    if (pending.length > 0) {
      return (
        `No trusted gateway is registered. ${pending.length} gateway(s) are awaiting a canonical ` +
        'attestation or an explicit operator allow-list.'
      );
    }
    if (unaddressable > 0) {
      return (
        `No trusted gateway is registered. ${unaddressable} connectivity source(s) have no real ` +
        'tunnel endpoint and were therefore not registered.'
      );
    }
    return 'No trusted gateway is registered.';
  }

  async evaluate(): Promise<CanonicalGatewaySelectionDecision> {
    const sources = this.connectivity.getAvailableSources();
    const health = new Map<string, GatewayHealth>();
    const capacity = new Map<string, GatewayCapacity>();
    await Promise.all(
      sources.map(async (source) => {
        const sourceHealth = await this.connectivity.registry
          .get(source.providerId)
          .getHealth(source.id);
        health.set(source.sourceId, deriveGatewayHealth(source.sourceId, sourceHealth));
      }),
    );

    const result = selectGateway({
      gateways: this.registry
        .list({ lifecycle: 'active', trust: 'trusted' })
        .filter((gateway) => isDefined(health.get(gateway.id))),
      health: Object.fromEntries(health),
      capacity: Object.fromEntries(capacity),
      ...(this.currentGatewayId === undefined ? {} : { currentGatewayId: this.currentGatewayId }),
      policy: this.policy,
    });

    const candidates: CanonicalGatewaySelectionCandidate[] = result.candidates.map((candidate) => ({
      gatewayId: candidate.gateway.id,
      eligible: candidate.eligible,
      score: candidate.score,
      explanation: candidate.explanation,
      ...(candidate.rejectionReason === undefined
        ? {}
        : { rejectionReason: candidate.rejectionReason }),
    }));

    return {
      selectedGatewayId: result.selected?.gateway.id,
      switched: result.switched,
      reason: result.reason,
      candidates,
      evidence: TRANSPORT_EVIDENCE,
    };
  }

  /**
   * Establishes the selected gateway: tunnel, route, destination verification and source switch.
   *
   * The steps run in order and are compensated in reverse order when a later step fails, so a
   * failed establishment never leaves a switched source, an installed route or a live tunnel
   * behind.
   */
  async apply(
    gatewayId: string,
    context?: RuntimeContext,
  ): Promise<CanonicalGatewayApplyResult> {
    const gateway = this.registry.get(gatewayId);
    if (!gateway) throw new Error(`Gateway ${gatewayId} not found in registry`);
    if (gateway.lifecycle !== 'active')
      throw new Error(`Gateway ${gatewayId} is not active (lifecycle: ${gateway.lifecycle})`);
    if (gateway.trust !== 'trusted')
      throw new Error(`Gateway ${gatewayId} is not trusted (trust: ${gateway.trust})`);

    const source = this.connectivity
      .getAvailableSources()
      .find((candidate) => candidate.sourceId === gatewayId);
    if (!source) throw new Error(`Gateway ${gatewayId} has no matching connectivity source`);

    const tunnelPlane = this.options.tunnelControlPlane;
    if (!tunnelPlane?.configured)
      throw new Error(
        `Gateway ${gatewayId} cannot be established: no tunnel control plane is configured`,
      );
    const declaration = gateway.tunnel;
    if (!declaration)
      throw new Error(
        `Gateway ${gatewayId} cannot be established: the gateway declares no tunnel`,
      );
    if (!gateway.capabilities.tunnelProtocols.includes(declaration.protocol))
      throw new Error(
        `Gateway ${gatewayId} declares protocol '${declaration.protocol}' that is not among its ` +
          `supported protocols (${gateway.capabilities.tunnelProtocols.join(', ') || 'none'})`,
      );

    const destination = this.options.destination;
    const verifyDestination = this.options.verifyDestination;
    const routing = this.options.routing;
    if (!destination)
      throw new Error(
        `Gateway ${gatewayId} cannot be established: no external destination is configured to verify`,
      );
    if (!verifyDestination)
      throw new Error(
        `Gateway ${gatewayId} cannot be established: no destination verifier is configured`,
      );
    if (!routing)
      throw new Error(`Gateway ${gatewayId} cannot be established: no routing engine is configured`);

    // Reuse a proven application for the same gateway; otherwise tear the previous one down.
    const existing = this.applications.get(gatewayId);
    if (existing) {
      const stillVerified = await tunnelPlane.verify(existing.tunnelId).catch(() => false);
      if (stillVerified) {
        const outcome = await verifyDestination(destination, this.runtimeContext(context));
        if (outcome.status === 'reachable') {
          return this.receipt(gatewayId, existing, outcome);
        }
      }
      await this.rollbackGateway(gatewayId);
    }

    const previousSourceId = this.connectivity.getActiveSource()?.sourceId;
    const configuration = this.buildTunnelConfiguration(gateway, declaration);

    let tunnelId: string | undefined;
    let routePlan: RoutePlan | undefined;
    let sourceSwitched = false;

    try {
      const connection = await tunnelPlane.connect({ configuration });
      tunnelId = connection.tunnelId;

      const tunnelHealthy = await tunnelPlane.verify(tunnelId);
      if (!tunnelHealthy)
        throw new Error(
          `tunnel ${tunnelId} did not pass its protocol health check after connecting`,
        );

      const plan = this.buildTunnelRoutePlan(gateway, declaration, tunnelId, destination);
      const applied = await routing.applyPlan(plan);
      routePlan = applied;
      if (applied.verification.status !== 'succeeded')
        throw new Error(
          `route through gateway ${gatewayId} was not verified (status: ${applied.verification.status})`,
        );

      const outcome = await verifyDestination(destination, this.runtimeContext(context));
      if (outcome.status !== 'reachable')
        throw new Error(
          `external destination ${destination.value} was not reached through gateway ${gatewayId}: ` +
            `${outcome.reason ?? outcome.status}`,
        );

      if (previousSourceId !== gatewayId) {
        await this.connectivity.switchSource(gatewayId);
        sourceSwitched = true;
      }

      const application: GatewayApplication = {
        gatewayId,
        tunnelId,
        routePlan,
        previousSourceId,
        destination,
        verifiedAt: nowIso(),
      };
      this.applications.set(gatewayId, application);
      await routing.confirmPlan?.(routePlan);
      return this.receipt(gatewayId, application, outcome);
    } catch (error) {
      await this.compensate({
        gatewayId,
        previousSourceId,
        sourceSwitched,
        tunnelId,
        routePlan,
      });
      throw error instanceof Error ? error : new Error('gateway establishment failed');
    }
  }

  private runtimeContext(context?: RuntimeContext): RuntimeContext {
    return context ?? ({ mode: 'live' } as RuntimeContext);
  }

  private receipt(
    gatewayId: string,
    application: GatewayApplication,
    outcome: CanonicalDestinationOutcome,
  ): CanonicalGatewayApplyResult {
    return {
      gatewayId,
      previousSourceId: application.previousSourceId,
      egressVerified: outcome.status === 'reachable',
      ...(application.tunnelId ? { tunnelId: application.tunnelId } : {}),
      ...(application.routePlan ? { routePlanId: application.routePlan.id } : {}),
      ...(application.destination ? { destination: application.destination.value } : {}),
      ...(outcome.latencyMs === undefined ? {} : { latencyMs: outcome.latencyMs }),
      ...(outcome.service ? { service: outcome.service } : {}),
    };
  }

  private buildTunnelConfiguration(
    gateway: GatewayMetadata,
    declaration: GatewayTunnelDeclaration,
  ): TunnelConfiguration {
    const addressFamily = gateway.endpoint.family === 'dual' ? 'dual' : gateway.endpoint.family;
    const protocol = toTunnelProtocol(declaration.protocol);
    const capabilities: TunnelCapability[] = [
      'authentication',
      'reconnect',
      'healthCheck',
      'systemWide',
      ...(addressFamily === 'ipv4' || addressFamily === 'dual' ? (['ipv4'] as const) : []),
      ...(addressFamily === 'ipv6' || addressFamily === 'dual' ? (['ipv6'] as const) : []),
      ...(declaration.routingMode === 'fullTunnel'
        ? (['fullTunnel'] as const)
        : (['splitRouting'] as const)),
    ];
    const keepaliveSeconds = declaration.keepaliveSeconds ?? 25;
    // The canonical tunnel contract requires a keepalive interval of at least 10s and a timeout
    // below the interval. The declaration is clamped to that contract instead of producing a
    // configuration the tunnel provider would reject.
    const keepaliveIntervalMs = Math.max(10_000, keepaliveSeconds * 1_000);
    const configuration: TunnelConfiguration = {
      endpoint: {
        host: gateway.endpoint.host,
        port: gateway.endpoint.port,
        protocol,
        addressFamily,
        metadata: { source: 'gateway-selection', gatewayId: gateway.id },
      },
      routingMode: declaration.routingMode,
      scope: 'system',
      dnsMode: 'resolverDecision',
      authentication: { type: 'key', credentialRef: declaration.credentialRef },
      credentialRef: declaration.credentialRef,
      securityProfile: 'strict',
      capabilities,
      keepalive: {
        enabled: keepaliveSeconds > 0,
        intervalMs: keepaliveIntervalMs,
        timeoutMs: Math.min(5_000, keepaliveIntervalMs - 1_000),
      },
      mtu: { validationStatus: 'unknown' },
      timeoutMs: 30_000,
      retryLimit: 1,
      metadata: { gatewayId: gateway.id },
    };
    if (declaration.routingMode === 'splitTunnel') {
      return {
        ...configuration,
        splitTunnel: {
          includedDestinations: [...(declaration.allowedDestinations ?? [])],
          excludedDestinations: [...(declaration.excludedDestinations ?? [])],
          precedence: 'include',
        },
      };
    }
    return configuration;
  }

  private buildTunnelRoutePlan(
    gateway: GatewayMetadata,
    declaration: GatewayTunnelDeclaration,
    tunnelId: string,
    destination: RoutingDestination,
  ): RoutePlan {
    const family = destination.family === 'ipv6' ? 'ipv6' : 'ipv4';
    const prefix = family === 'ipv6' ? 128 : 32;
    const target = destination.kind === 'default' ? 'default' : `${destination.value}/${prefix}`;
    const interfaceName = declaration.interfaceName;
    if (!interfaceName)
      throw new Error(
        `gateway ${gateway.id} does not declare a tunnel interface; the route cannot be installed`,
      );
    const routeId = `gateway-route:${gateway.id}:${tunnelId}`;
    const pathId = `gateway-path:${gateway.id}:${tunnelId}`;
    return {
      id: `gateway-plan:${gateway.id}:${Date.now()}`,
      destination,
      candidatePaths: [],
      selectedPath: {
        id: pathId,
        type: 'tunnel',
        hops: [gateway.endpoint.host],
        route: {
          id: routeId,
          destination: target,
          prefix,
          interfaceName,
          protocol: 'static',
          metric: 10,
          table: { id: 'main', kind: 'main', name: 'main' },
          family,
          scope: 'global',
          state: 'active',
          priority: 10,
          capabilities: ['encrypted'],
          metadata: { gatewayId: gateway.id, tunnelId, interfaceName },
        },
        capabilities: ['encrypted'],
        state: 'active',
        metadata: { gatewayId: gateway.id, tunnelId, interfaceName },
      },
      reason: `route ${target} through the tunnel of gateway ${gateway.id}`,
      policy: [],
      actions: [
        {
          type: 'apply-route',
          capability: 'network.route',
          input: { interfaceName, target, gatewayId: gateway.id, tunnelId },
          description: `install the route to ${target} through ${interfaceName}`,
        },
      ],
      verification: {
        required: true,
        timeoutMs: 5_000,
        strategy: 'provider',
        status: 'pending',
      },
      explanation: {
        matchedRouteIds: [routeId],
        eligibleCandidateIds: [pathId],
        rejected: [],
        policy: [],
        scores: {},
        selectedCandidateId: pathId,
        reason: `the tunnel interface ${interfaceName} of gateway ${gateway.id} carries the traffic`,
        precedence: [pathId],
      },
      dryRun: false,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Compensates a failed establishment: the source switch is reverted, the route is rolled back
   * and the tunnel is torn down. Compensation never hides the original failure.
   */
  private async compensate(state: {
    gatewayId: string;
    previousSourceId: string | undefined;
    sourceSwitched: boolean;
    tunnelId: string | undefined;
    routePlan: RoutePlan | undefined;
  }): Promise<void> {
    if (state.sourceSwitched && state.previousSourceId !== undefined) {
      await this.connectivity.switchSource(state.previousSourceId).catch(() => undefined);
    }
    if (state.routePlan) {
      await this.options.routing?.rollbackPlan(state.routePlan).catch(() => undefined);
    }
    // The tunnel control plane may have registered a tunnel before the connection failed, so
    // the teardown is always requested.
    await this.options.tunnelControlPlane?.rollback().catch(() => undefined);
    this.applications.delete(state.gatewayId);
  }

  /**
   * Rolls a gateway's established state back: the source switch is reverted, the route is rolled
   * back and the tunnel is torn down. Returns `true` only when every step succeeded.
   */
  async rollback(gatewayId: string): Promise<boolean> {
    const application = this.applications.get(gatewayId);
    if (!application) return true;
    let ok = true;
    if (application.previousSourceId !== undefined && application.previousSourceId !== gatewayId) {
      try {
        await this.connectivity.switchSource(application.previousSourceId);
      } catch {
        ok = false;
      }
    }
    if (application.routePlan) {
      const rolledBack = await this.options.routing?.rollbackPlan(application.routePlan);
      if (rolledBack !== true) ok = false;
    }
    const tunnelRolledBack = await this.options.tunnelControlPlane?.rollback();
    if (tunnelRolledBack !== true) ok = false;
    this.applications.delete(gatewayId);
    return ok;
  }

  private async rollbackGateway(gatewayId: string): Promise<void> {
    await this.rollback(gatewayId).catch(() => undefined);
  }
}
