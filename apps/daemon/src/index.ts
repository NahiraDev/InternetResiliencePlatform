import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Application, createAllBuiltinProviders, IntelligentDnsEngine } from '@irp/core';
import { loadConfig } from '@irp/config';
import { ConnectivityManager, type ConnectivitySource } from '@irp/connectivity';
import { HttpAvailabilityProbe } from '@irp/network';
import { createLogger } from '@irp/logger';
import {
  RoutingEngine,
  parseDestination,
  pathFailureDomains,
  type NetworkPath,
} from '@irp/routing';
import { TunnelProviderRegistry } from '@irp/tunnel';
import {
  GatewayRegistrySelectionPlane,
  CanonicalDecisionProvider,
  createCanonicalRuntime,
  negotiatePlatformCapabilities,
  NetworkEventStormGuard,
  ObservationDedupCache,
  evaluateSelfHealth,
  classifyFailure,
  withOperationTimeout,
  RuntimeScheduler,
  TunnelRegistryControlPlane,
  type Observation,
  type ObservationProvider,
  type ObservationProviderResult,
  type PathStrategyEvidence,
  type RuntimeContext,
  type RuntimeSchedulerConfig,
} from '@irp/resilience-runtime';
import { AutoOptimizationHost } from './auto-optimization-host.js';
import { PluginHost } from './plugin-host.js';

const execFileAsync = promisify(execFile);

/**
 * Default deduplication window for the observation provider.
 *
 * Must be at least one cycle interval, otherwise a repeated reading on the next
 * cycle is always outside the window and can never be deduplicated.
 */
const DEFAULT_DEDUP_TTL_MS = 60_000;

/** Deadline for platform observation calls so a hung tool cannot stall a cycle. */
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

const configuredDestinationUrl = process.env.IRP_DESTINATION_URL;
const configuredDestination = configuredDestinationUrl
  ? (() => {
      try {
        const url = new URL(configuredDestinationUrl);
        return { hostname: url.hostname, port: url.port ? Number(url.port) : undefined };
      } catch {
        return undefined;
      }
    })()
  : undefined;

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

export class RuntimeDaemonHost {
  lifecycle: 'created' | 'initialized' | 'ready' | 'running' | 'stopping' | 'stopped' = 'created';
  readonly connectivity = new ConnectivityManager();
  readonly routing = new RoutingEngine();
  readonly dnsProviders = createAllBuiltinProviders();
  readonly dns = new IntelligentDnsEngine(this.dnsProviders, {
    check: async (provider) => provider.health(),
  });
  readonly observer = new LinuxObservationProvider(this.connectivity);
  readonly tunnelPlane = new TunnelRegistryControlPlane(new TunnelProviderRegistry(), {
    enabled: process.env.IRP_TUNNEL_ENABLED === '1',
  });
  readonly gatewaySelection = new GatewayRegistrySelectionPlane(this.connectivity, {
    enabled: process.env.IRP_GATEWAY_SELECTION_ENABLED === '1',
  });
  readonly destinationProbe = configuredDestinationUrl
    ? new HttpAvailabilityProbe({ url: configuredDestinationUrl, timeoutMs: 5_000 })
    : undefined;
  readonly decisionProvider = new CanonicalDecisionProvider(undefined, {
    pathEvidence: {
      evaluate: async (context) => this.evaluatePathEvidence(context),
    },
  });
  readonly composition = createCanonicalRuntime({
    executionMode: 'real',
    observationProviders: [this.observer],
    runtimeId: 'daemon-runtime',
    decisionProvider: this.decisionProvider,
    networkControlPlane: {
      connectivity: this.connectivity,
      routing: this.routing,
      dns: {
        engine: this.dns,
        getActiveProviderId: () => this.dns.status().activeProviderId,
        applyProvider: async (provider) => this.applyDnsProvider(provider.id),
      },
      tunnel: this.tunnelPlane,
      gatewaySelection: this.gatewaySelection,
      ...(configuredDestination
        ? { destination: parseDestination(configuredDestination.hostname) }
        : {}),
      verifyDestination: async (destination, _context) => {
        if (!this.destinationProbe || !configuredDestination)
          return { status: 'unknown' as const, reason: 'IRP_DESTINATION_URL is not configured' };
        if (destination.kind === 'hostname' && destination.value !== configuredDestination.hostname)
          return {
            status: 'failed' as const,
            reason: 'destination is outside configured probe scope',
          };
        const controller = new AbortController();
        try {
          const result = await withOperationTimeout(
            'destination-probe',
            this.destinationProbe.execute({
              signal: controller.signal,
              now: () => new Date().toISOString(),
            }),
            5_000,
            controller.signal,
          );
          return {
            status: result.success ? ('reachable' as const) : ('failed' as const),
            latencyMs: result.latencyMs,
            ...(result.error ? { reason: result.error } : {}),
          };
        } finally {
          controller.abort();
        }
      },
    },
  });
  readonly runtime = this.composition.runtime;
  readonly plugins = new PluginHost([]);
  // Advisory-only: recommendations cannot execute through this host. Any
  // mutation must enter ResilienceRuntime's canonical safety/transaction path.
  readonly autoOptimization = new AutoOptimizationHost();
  readonly scheduler: RuntimeScheduler;
  constructor(config: Partial<RuntimeSchedulerConfig> = {}) {
    this.scheduler = new RuntimeScheduler(this.runtime, {
      enabled: false,
      mode: 'safe',
      cycleIntervalMs: 30_000,
      maxConcurrentCycles: 1,
      cooldownMs: 5_000,
      executionBudgetMs: 10_000,
      ...config,
    });
  }
  private async evaluatePathEvidence(
    context: RuntimeContext,
  ): Promise<PathStrategyEvidence | undefined> {
    const destinationValue =
      context.observationSnapshot?.observations
        .map((observation) => observation.metadata.destination)
        .find((value): value is string => typeof value === 'string' && value.length > 0) ??
      context.compiledIntent?.target.destination ??
      context.compiledIntent?.target.hostname ??
      configuredDestination?.hostname;
    if (!destinationValue) return undefined;
    await this.connectivity.discoverResources();
    const destination = parseDestination(destinationValue);
    const decision = await this.routing.simulateRouting({
      destination,
      connectivitySources: this.connectivity.getAvailableSources(),
    });
    const current = decision.plan.currentPath;
    const selected = decision.selected;
    const currentScore = current
      ? decision.candidates.find((candidate) => candidate.path.id === current.id)?.totalScore
      : undefined;
    const selectedScore = selected?.totalScore;
    const currentFailureDomains = current ? failureDomains(current) : [];
    const candidates = decision.candidates.map((candidate) => ({
      id: candidate.path.id,
      type: candidate.path.type,
      ...(candidate.totalScore === undefined ? {} : { score: candidate.totalScore }),
      state: candidate.path.state,
      failureDomains: failureDomains(candidate.path),
    }));
    const alternativeDomains = new Set(
      decision.candidates
        .filter(
          (candidate) => candidate.path.id !== current?.id && candidate.eligibility !== 'rejected',
        )
        .flatMap((candidate) => failureDomains(candidate.path)),
    );
    if (!selected || selectedScore === undefined) {
      return {
        destination: destinationValue,
        recommendation: 'unavailable',
        ...(current?.id ? { currentPathId: current.id } : {}),
        ...(currentScore === undefined ? {} : { currentScore }),
        candidatePaths: candidates,
        diverseAlternativeCount: 0,
        confidence: 0,
        expectedBenefit: 0,
        risk: 1,
        explanation: ['routing engine found no eligible destination path'],
      };
    }
    const improvement = currentScore === undefined ? selectedScore : selectedScore - currentScore;
    const switching =
      selected.path.id !== current?.id && improvement >= this.routing.config.hysteresis;
    const selectedDomains = new Set(failureDomains(selected.path));
    const diverseAlternativeCount = decision.candidates.filter(
      (candidate) =>
        candidate.path.id !== selected.path.id &&
        candidate.eligibility !== 'rejected' &&
        failureDomains(candidate.path).some((domain) => !selectedDomains.has(domain)),
    ).length;
    return {
      destination: destinationValue,
      recommendation: switching ? 'switch' : 'remain',
      ...(current?.id ? { currentPathId: current.id } : {}),
      selectedPathId: selected.path.id,
      ...(currentScore === undefined ? {} : { currentScore }),
      selectedScore,
      candidatePaths: candidates,
      diverseAlternativeCount,
      confidence: Math.max(0, Math.min(1, selectedScore / 100)),
      expectedBenefit: Math.max(0, Math.min(1, improvement / 100)),
      risk: switching && diverseAlternativeCount === 0 ? 0.45 : 0.2,
      explanation: [
        decision.plan.reason,
        `routing candidates: ${candidates.length}`,
        `failure-domain-diverse alternatives: ${diverseAlternativeCount}`,
        ...(currentFailureDomains.length
          ? [`current failure domains: ${currentFailureDomains.join(',')}`]
          : []),
        ...(alternativeDomains.size
          ? [`alternative domains: ${[...alternativeDomains].join(',')}`]
          : []),
      ],
    };
  }
  private async applyDnsProvider(providerId: string): Promise<void> {
    const provider = this.dnsProviders.find((candidate) => candidate.id === providerId);
    if (!provider) throw new Error(`Unknown DNS provider: ${providerId}`);
    const negotiation = this.platformNegotiation(['dns.write']);
    if (negotiation.denied.length > 0) throw new Error(negotiation.reasons.join('; '));
    const active = this.connectivity.getActiveSource();
    const interfaceName = active?.interfaceName;
    if (process.platform !== 'linux' || !interfaceName)
      throw new Error('live DNS switching requires a discovered Linux network interface');
    const servers = provider.metadata().endpoints.ipv4;
    if (servers.length === 0)
      throw new Error(`DNS provider ${providerId} has no IPv4 resolver endpoints`);
    await execFileAsync('resolvectl', ['dns', interfaceName, ...servers], {
      timeout: 5_000,
      maxBuffer: 64 * 1024,
    });
    this.dns.selectProvider(providerId);
  }
  /**
   * Linux capability negotiation stays inside the canonical runtime boundary.
   * The daemon advertises and checks only capabilities implemented by its
   * OS-specific adapters; unsupported work is denied with an explicit reason
   * instead of executing through another path.
   */
  platformNegotiation(requestedCapabilities: readonly string[] = this.runtime
    .capabilities()
    .flatMap((descriptor) => [...descriptor.capabilities])) {
    return negotiatePlatformCapabilities('linux', requestedCapabilities);
  }
  async initialize() {
    await this.connectivity.discoverResources();
    await this.dns.evaluate();
    this.lifecycle = 'ready';
  }
  async start() {
    if (this.lifecycle === 'created') await this.initialize();
    await this.plugins.start();
    this.lifecycle = 'running';
    this.scheduler.start();
  }
  async stop() {
    this.lifecycle = 'stopping';
    this.scheduler.stop();
    await this.plugins.stop();
    this.lifecycle = 'stopped';
  }
  /**
   * Distinguishes daemon distress from network distress using scheduler,
   * telemetry, and process evidence. The daemon has no production queue, so
   * queue fields remain zero rather than inventing backpressure evidence.
   */
  selfHealth() {
    const scheduler = this.scheduler.status();
    const telemetry = this.runtime.telemetry.snapshot();
    const cycleLatencyMs = telemetry['runtime_cycle_duration'];
    const health = evaluateSelfHealth({
      schedulerActive: scheduler.active,
      schedulerFailedTotal: scheduler.failedTotal,
      schedulerOverlapPreventedTotal: scheduler.overlapPreventedTotal,
      queueDepth: 0,
      queueRejectedTotal: 0,
      telemetryFailuresTotal: telemetry['runtime_telemetry_failures_total'] ?? 0,
      performance: {
        heapUsedBytes: process.memoryUsage().heapUsed,
        ...(typeof cycleLatencyMs === 'number' ? { cycleLatencyMs } : {}),
      },
    });
    // Distinguish IRP distress from network distress. Without this, an internal
    // fault is reported as a generic unhealthy state and provokes network
    // recovery for a problem that is not in the network.
    const failureClass = classifyFailure({
      runtimeFault: scheduler.failedTotal > 0,
      selfUnhealthy: health.level !== 'healthy',
      networkDegraded: this.observer
        .observationsSnapshot()
        .some((observation: Observation) => observation.status === 'failed'),
      dependencyFault: (telemetry['runtime_telemetry_failures_total'] ?? 0) > 0,
    });
    return { ...health, failureClass };
  }
  health() {
    return {
      lifecycle: this.lifecycle,
      scheduler: this.scheduler.status(),
      runtimeId: this.runtime.runtimeId,
      instanceId: this.runtime.instanceId,
      connectivityProviders: this.connectivity.getProviders().map((provider) => provider.id),
      connectivitySources: this.connectivity.getAvailableSources().map((source) => source.sourceId),
      dns: {
        providers: this.dnsProviders.map((provider) => provider.id),
        activeProviderId: this.dns.status().activeProviderId,
      },
      gatewaySelection: {
        configured: this.gatewaySelection.configured,
        currentGatewayId: this.gatewaySelection.currentGatewayId,
        gateways: this.gatewaySelection.gateways().length,
      },
      tunnel: {
        configured: this.tunnelPlane.configured,
        activeTunnel: this.tunnelPlane.activeTunnel,
      },
      plugins: this.plugins.status(),
      autoOptimization: { bound: true, enabled: this.autoOptimization.enabled },
      self: this.selfHealth(),
      ingress: {
        storm: this.observer.stormStatus(),
        duplicates: this.observer.dedupStatus(),
      },
      platform: this.platformNegotiation(),
      capabilities: this.runtime.capabilities(),
    };
  }
}

const failureDomains = (path: NetworkPath): string[] => [...pathFailureDomains(path)];

export const createDaemon = (): Application => {
  const config = loadConfig();
  const logger = createLogger(config.logger.level);
  return new Application(config, logger);
};
export const createRuntimeDaemonHost = (config?: Partial<RuntimeSchedulerConfig>) =>
  new RuntimeDaemonHost(config);

if (process.argv[1]?.endsWith('index.js')) {
  const daemon = createDaemon();
  const host = createRuntimeDaemonHost({ enabled: process.env.IRP_RUNTIME_ENABLED === '1' });
  await host.start();
  await daemon.start();
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    daemon.logger.info('shutdown signal received', { signal });
    await host.stop();
    await daemon.stop();
    process.exit(0);
  };
  process.on('SIGTERM', (signal) => void shutdown(signal));
  process.on('SIGINT', (signal) => void shutdown(signal));
  process.on('SIGHUP', () => void daemon.reload(loadConfig()));
}
