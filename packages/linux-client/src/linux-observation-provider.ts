/**
 * Shared Linux measurements for the canonical ResilienceRuntime.
 * Observation-only: host changes stay behind canonical authorization, policy,
 * privileged mutation, verification and recovery boundaries.
 */
import type { ConnectivityManager, ConnectivitySource } from '@irp/connectivity';
import {
  NetworkEventStormGuard,
  ObservationDedupCache,
  withOperationTimeout,
  type Observation,
  type ObservationProvider,
  type ObservationProviderResult,
  type RuntimeContext,
} from '@irp/resilience-runtime';

const DEFAULT_DEDUP_TTL_MS = 60_000;
const OPERATION_TIMEOUT_MS = 5_000;

type Health = {
  score?: number;
  status?: string;
  latencyMs?: number;
  packetLoss?: number;
  jitterMs?: number;
  internetReachable?: boolean;
  dnsReachable?: boolean;
  gatewayReachable?: boolean;
  ipv4?: boolean;
  ipv6?: boolean;
};

const observationsForSource = (
  context: RuntimeContext,
  source: ConnectivitySource,
  health: Health,
): Observation[] => {
  const now = new Date().toISOString();
  const result: Observation[] = [];
  const quality = Number.isFinite(health.score) ? health.score! : 0;
  result.push({
    id: `connectivity-${source.sourceId}-quality-${context.correlationId}`,
    schemaVersion: 1,
    createdAt: now,
    correlationId: context.correlationId,
    source: 'irp-daemon-connectivity',
    metadata: {
      sourceId: source.sourceId,
      providerId: source.providerId,
      resourceId: source.id,
      interfaceName: source.interfaceName,
      gateway: source.gateway,
    },
    category: 'network',
    metric: 'quality_score',
    value: quality,
    timestamp: now,
    freshnessMs: 0,
    confidence: health.status ? 0.9 : 0.5,
    severity:
      health.status === 'healthy' ? 'info' : health.status === 'unhealthy' ? 'critical' : 'warning',
    status:
      health.status === 'healthy'
        ? 'healthy'
        : health.status === 'unhealthy'
          ? 'failed'
          : 'degraded',
  });
  if (typeof health.latencyMs === 'number')
    result.push({
      id: `connectivity-${source.sourceId}-latency-${context.correlationId}`,
      schemaVersion: 1,
      createdAt: now,
      correlationId: context.correlationId,
      source: 'irp-daemon-connectivity',
      metadata: { sourceId: source.sourceId },
      category: 'network',
      metric: 'latency_ms',
      value: health.latencyMs,
      timestamp: now,
      freshnessMs: 0,
      confidence: 0.9,
      severity: health.latencyMs > 100 ? 'warning' : 'info',
      status: 'healthy',
    });
  if (typeof health.packetLoss === 'number')
    result.push({
      id: `connectivity-${source.sourceId}-loss-${context.correlationId}`,
      schemaVersion: 1,
      createdAt: now,
      correlationId: context.correlationId,
      source: 'irp-daemon-connectivity',
      metadata: { sourceId: source.sourceId },
      category: 'network',
      metric: 'packet_loss',
      value: health.packetLoss,
      timestamp: now,
      freshnessMs: 0,
      confidence: 0.9,
      severity: health.packetLoss > 0 ? 'warning' : 'info',
      status: 'healthy',
    });
  if (typeof health.dnsReachable === 'boolean')
    result.push({
      id: `connectivity-${source.sourceId}-dns-${context.correlationId}`,
      schemaVersion: 1,
      createdAt: now,
      correlationId: context.correlationId,
      source: 'irp-daemon-connectivity',
      metadata: { sourceId: source.sourceId },
      category: 'network',
      metric: 'dns_reachable',
      value: health.dnsReachable ? 1 : 0,
      timestamp: now,
      freshnessMs: 0,
      confidence: 0.95,
      severity: health.dnsReachable ? 'info' : 'critical',
      status: health.dnsReachable ? 'healthy' : 'failed',
    });
  if (typeof health.ipv4 === 'boolean')
    result.push({
      id: `connectivity-${source.sourceId}-ipv4-${context.correlationId}`,
      schemaVersion: 1,
      createdAt: now,
      correlationId: context.correlationId,
      source: 'irp-daemon-connectivity',
      metadata: { sourceId: source.sourceId },
      category: 'network',
      metric: 'ipv4_available',
      value: health.ipv4 ? 1 : 0,
      timestamp: now,
      freshnessMs: 0,
      confidence: 0.95,
      severity: health.ipv4 ? 'info' : 'warning',
      status: 'healthy',
    });
  if (typeof health.ipv6 === 'boolean')
    result.push({
      id: `connectivity-${source.sourceId}-ipv6-${context.correlationId}`,
      schemaVersion: 1,
      createdAt: now,
      correlationId: context.correlationId,
      source: 'irp-daemon-connectivity',
      metadata: { sourceId: source.sourceId },
      category: 'network',
      metric: 'ipv6_available',
      value: health.ipv6 ? 1 : 0,
      timestamp: now,
      freshnessMs: 0,
      confidence: 0.95,
      severity: health.ipv6 ? 'info' : 'warning',
      status: 'healthy',
    });
  return result;
};

export class LinuxObservationProvider implements ObservationProvider {
  readonly id = 'linux-connectivity-observer';
  private readonly stormGuard: NetworkEventStormGuard;
  private readonly observationDedup: ObservationDedupCache;
  private lastObservations: Observation[] = [];
  constructor(
    private readonly connectivity: ConnectivityManager,
    options: {
      readonly stormGuard?: NetworkEventStormGuard;
      readonly observationDedup?: ObservationDedupCache;
      /**
       * Deduplication window. Defaults to one full cycle interval so a repeated
       * reading across consecutive cycles is actually suppressed; a window
       * shorter than the interval can never observe a duplicate.
       */
      readonly dedupTtlMs?: number;
    } = {},
  ) {
    this.stormGuard = options.stormGuard ?? new NetworkEventStormGuard();
    this.observationDedup =
      options.observationDedup ?? new ObservationDedupCache(options.dedupTtlMs ?? DEFAULT_DEDUP_TTL_MS);
  }
  stormStatus() {
    return this.stormGuard.status();
  }
  /** Most recent admitted observations, for health classification. */
  observationsSnapshot(): readonly Observation[] {
    return [...this.lastObservations];
  }
  dedupStatus() {
    return this.observationDedup.status();
  }
  observationDedupKey(observation: Observation): string {
    return [
      observation.source,
      observation.category,
      observation.metric,
      JSON.stringify(observation.value),
      observation.status,
    ].join('|');
  }
  async collect(context: RuntimeContext): Promise<ObservationProviderResult> {
    if (process.platform !== 'linux')
      return {
        providerId: this.id,
        observations: [],
        collectedAt: new Date().toISOString(),
        errors: ['linux connectivity observation is unavailable on non-linux platforms'],
      };
    const errors: string[] = [];
    // Discovery and health probes shell out to platform tools. Without a
    // deadline a hung probe stalls the whole observation cycle indefinitely.
    try {
      await withOperationTimeout(
        'connectivity-discovery',
        this.connectivity.discoverResources(),
        OPERATION_TIMEOUT_MS,
      );
    } catch (error) {
      errors.push(`discovery: ${error instanceof Error ? error.message : 'discovery failed'}`);
    }
    const sources = this.connectivity.getAvailableSources();
    const observations: Observation[] = [];
    await Promise.all(
      sources.map(async (source) => {
        try {
          const health = await withOperationTimeout(
            `health-probe-${source.sourceId}`,
            this.connectivity.registry.get(source.providerId)!.getHealth(source.id),
            OPERATION_TIMEOUT_MS,
          );
          observations.push(...observationsForSource(context, source, health));
        } catch (error) {
          errors.push(
            `${source.sourceId}: ${error instanceof Error ? error.message : 'health probe failed'}`,
          );
        }
      }),
    );
    const active = this.connectivity.getActiveSource();
    const now = new Date().toISOString();
    observations.push({
      id: `connectivity-internet-${context.correlationId}`,
      schemaVersion: 1,
      createdAt: now,
      correlationId: context.correlationId,
      source: 'irp-daemon-connectivity',
      metadata: { active: active?.sourceId },
      category: 'network',
      metric: 'internet_connectivity',
      value: active ? 1 : 0,
      timestamp: now,
      freshnessMs: 0,
      confidence: 0.95,
      severity: active ? 'info' : 'critical',
      status: active ? 'healthy' : 'failed',
    });
    // Rate limiting is applied per observation, not once per cycle. Admitting a
    // single token per 30s cycle meant a 500/s budget could never be reached, so
    // the guard could not shed a genuine burst of network events.
    const admittedObservations = observations.filter((observation) => {
      const storm = this.stormGuard.admit(Date.now());
      if (!storm.admitted) {
        errors.push(`storm shed observation ${observation.id}`);
        return false;
      }
      return this.observationDedup.admit(this.observationDedupKey(observation), Date.now()).admitted;
    });
    // The last admitted set is retained so a cycle that sheds everything under
    // storm pressure still reports the most recent real evidence.
    if (admittedObservations.length > 0) this.lastObservations = admittedObservations;
    return {
      providerId: this.id,
      observations: admittedObservations,
      collectedAt: now,
      errors,
    };
  }
}

