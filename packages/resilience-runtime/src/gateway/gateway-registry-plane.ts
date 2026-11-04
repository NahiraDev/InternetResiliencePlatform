import type { ConnectivityHealth, ConnectivityManager } from '@irp/connectivity';
import {
  InMemoryGatewayRegistry,
  selectGateway,
  type GatewayCapacity,
  type GatewayEndpoint,
  type GatewayHealth,
  type GatewayHealthProbe,
  type GatewayHealthSample,
  type GatewayMetadata,
  type GatewaySelectionPolicy,
} from '@irp/gateway-registry';
import type { TunnelConfiguration } from '@irp/tunnel';
import { isDefined, nowIso } from '@irp/utils';
import type {
  CanonicalGatewaySelectionCandidate,
  CanonicalGatewaySelectionDecision,
  CanonicalGatewaySelectionPlane,
} from '../canonical-network-adapter.js';
import { TunnelRegistryControlPlane } from '../tunnel/tunnel-control-plane.js';

export interface GatewayRegistrySelectionPlaneOptions {
  enabled?: boolean;
  policy?: Partial<GatewaySelectionPolicy>;
  probe?: GatewayHealthProbe;
  tunnelControlPlane?: TunnelRegistryControlPlane;
}

const deriveGatewayHealth = (gatewayId: string, health: ConnectivityHealth): GatewayHealth => ({
  gatewayId,
  status:
    health.status === 'unhealthy'
      ? 'unreachable'
      : health.status === 'healthy'
        ? 'healthy'
        : health.status === 'degraded'
          ? 'degraded'
          : 'unknown',
  score: Number.isFinite(health.score) ? health.score : 0,
  checkedAt: health.checkedAt,
  ...(health.latencyMs === undefined ? {} : { latencyMs: health.latencyMs }),
  ...(health.packetLoss === undefined ? {} : { packetLossPercent: health.packetLoss }),
  reason: 'derived from connectivity source health evidence',
});

const deriveGatewayHealthFromProbe = (
  gatewayId: string,
  sample: { reachable: boolean; latencyMs?: number; packetLossPercent?: number },
): GatewayHealth => {
  const score = sample.reachable
    ? sample.latencyMs !== undefined
      ? Math.max(0, Math.min(100, 100 - (sample.latencyMs - 20) * 0.5 - (sample.packetLossPercent ?? 0) * 10))
      : 70
    : 0;
  return {
    gatewayId,
    status: !sample.reachable ? 'unreachable' : score >= 80 ? 'healthy' : 'degraded',
    score,
    checkedAt: new Date().toISOString(),
    ...(sample.latencyMs === undefined ? {} : { latencyMs: sample.latencyMs }),
    ...(sample.packetLossPercent === undefined ? {} : { packetLossPercent: sample.packetLossPercent }),
    reason: 'derived from direct gateway health probe',
  };
};

export class GatewayRegistrySelectionPlane implements CanonicalGatewaySelectionPlane {
  private readonly registry = new InMemoryGatewayRegistry();
  private readonly policy: Partial<GatewaySelectionPolicy>;

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

  async synchronize(): Promise<void> {
    await this.connectivity.discoverResources();
    const sources = this.connectivity.getAvailableSources();
    const seen = new Set<string>();
    for (const source of sources) {
      seen.add(source.sourceId);
      if (!this.registry.get(source.sourceId)) {
        this.registry.register({
          id: source.sourceId,
          name: source.providerId,
          description: 'gateway derived from connectivity source',
          endpoint: {
            host: source.gateway ?? source.providerId,
            port: 443,
            family: 'dual' as const,
          },
          ownership: { ownerId: source.providerId, managedBy: 'control-plane' as const },
          capabilities: {
            tunnelProtocols: [],
            addressFamilies: ['ipv4' as const, 'ipv6' as const, 'dual' as const],
            transports: [],
            features: [],
          },
          lifecycle: source.available ? 'active' : 'disabled',
          trust: 'trusted',
          tags: [source.providerId],
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      }
    }
  }

  /**
   * Probe each gateway endpoint with actual network measurements, then run
   * gateway selection using the observed health evidence. This replaces
   * evaluate() when real endpoint probing is required before selection.
   */
  async probeAndEvaluate(): Promise<CanonicalGatewaySelectionDecision> {
    const gateways = this.registry.list({ lifecycle: 'active', trust: 'trusted' });
    if (gateways.length === 0) {
      return {
        selectedGatewayId: undefined,
        switched: false,
        reason: 'No gateways are registered in the registry.',
        candidates: [],
      };
    }

    const probe = this.options.probe;
    if (!probe) {
      throw new Error(
        'GatewayHealthProbe is not configured; cannot perform probe-based evaluation.',
      );
    }

    const proberTargets = gateways.map((g) => ({
      id: g.id,
      endpoint: g.endpoint,
    }));

    const probeGatewaysFn = (probe as unknown as { probeGateways?: (gateways: { id: string; endpoint: GatewayEndpoint }[]) => Promise<GatewayHealthSample[]> }).probeGateways;
    if (!probeGatewaysFn) {
      throw new Error(
        'GatewayHealthProbe does not implement probeGateways; cannot perform probe-based evaluation.',
      );
    }

    const samples = await probeGatewaysFn(proberTargets);
    const health = new Map<string, GatewayHealth>();
    for (const sample of samples) {
      health.set(sample.gatewayId, deriveGatewayHealthFromProbe(sample.gatewayId, sample));
    }

    const capacity = new Map<string, GatewayCapacity>();
    const result = selectGateway({
      gateways,
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
    };
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
    };
  }

  async apply(gatewayId: string): Promise<void> {
    const source = this.connectivity
      .getAvailableSources()
      .find((candidate) => candidate.sourceId === gatewayId);
    if (!source) throw new Error(`Gateway ${gatewayId} has no matching connectivity source`);
    await this.connectivity.switchSource(source.sourceId);

    // If a tunnel control plane is configured, establish a tunnel to the
    // selected gateway. The gateway's endpoint is used to build the tunnel
    // configuration so traffic is routed through the selected gateway.
    const tunnelPlane = this.options.tunnelControlPlane;
    if (tunnelPlane?.configured) {
      const gateway = this.registry.get(gatewayId);
      if (!gateway) throw new Error(`Gateway ${gatewayId} not found in registry`);
      const configuration: TunnelConfiguration = {
        endpoint: {
          host: gateway.endpoint.host,
          port: gateway.endpoint.port,
          protocol: 'wireguard',
          addressFamily: gateway.endpoint.family,
          metadata: { source: 'gateway-selection', gatewayId },
        },
        routingMode: 'fullTunnel',
        scope: 'system',
        dnsMode: 'insideTunnel',
        authentication: {
          type: 'key',
          credentialRef: 'wireguard-peer-key',
        },
        securityProfile: 'secure',
        capabilities: [
          'ipv4', 'ipv6', 'udp', 'fullTunnel', 'systemWide',
          'authentication', 'keepalive', 'reconnect', 'healthCheck', 'killSwitch',
        ],
        keepalive: { enabled: true, intervalMs: 25_000, timeoutMs: 5_000 },
        mtu: { configuredMtu: 1420, validationStatus: 'unknown' },
        timeoutMs: 30_000,
        retryLimit: 1,
        metadata: { gatewayId },
      };
      await tunnelPlane.connect({ configuration });
    }
  }
}
