import type { ConnectivityHealth, ConnectivityManager } from '@irp/connectivity';
import {
  InMemoryGatewayRegistry,
  selectGateway,
  type GatewayCapacity,
  type GatewayHealth,
  type GatewayMetadata,
  type GatewaySelectionPolicy,
} from '@irp/gateway-registry';
import { isDefined, nowIso } from '@irp/utils';
import type {
  CanonicalGatewaySelectionCandidate,
  CanonicalGatewaySelectionDecision,
  CanonicalGatewaySelectionPlane,
} from '../canonical-network-adapter.js';

export interface GatewayRegistrySelectionPlaneOptions {
  enabled?: boolean;
  policy?: Partial<GatewaySelectionPolicy>;
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
  ...(health.packetLoss === undefined
    ? {}
    : { packetLossPercent: health.packetLoss }),
  reason: 'derived from connectivity source health evidence',
});

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
      ...(this.currentGatewayId === undefined
        ? {}
        : { currentGatewayId: this.currentGatewayId }),
      policy: this.policy,
    });

    const candidates: CanonicalGatewaySelectionCandidate[] = result.candidates.map(
      (candidate) => ({
        gatewayId: candidate.gateway.id,
        eligible: candidate.eligible,
        score: candidate.score,
        explanation: candidate.explanation,
        ...(candidate.rejectionReason === undefined
          ? {}
          : { rejectionReason: candidate.rejectionReason }),
      }),
    );

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
  }
}