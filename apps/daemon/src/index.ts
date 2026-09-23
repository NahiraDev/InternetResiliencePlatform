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
  constructor(private readonly connectivity: ConnectivityManager) {}
  async collect(context: RuntimeContext): Promise<ObservationProviderResult> {
    if (process.platform !== 'linux')
      return {
        providerId: this.id,
        observations: [],
        collectedAt: new Date().toISOString(),
        errors: ['linux connectivity observation is unavailable on non-linux platforms'],
      };
    await this.connectivity.discoverResources();
    const sources = this.connectivity.getAvailableSources();
    const observations: Observation[] = [];
    const errors: string[] = [];
    await Promise.all(
      sources.map(async (source) => {
        try {
          observations.push(
            ...observationsForSource(
              context,
              source,
              await this.connectivity.registry.get(source.providerId).getHealth(source.id),
            ),
          );
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
    return { providerId: this.id, observations, collectedAt: now, errors };
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
        const timeout = setTimeout(() => controller.abort(), 5_000);
        try {
          const result = await this.destinationProbe.execute({
            signal: controller.signal,
            now: () => new Date().toISOString(),
          });
          return {
            status: result.success ? ('reachable' as const) : ('failed' as const),
            latencyMs: result.latencyMs,
            ...(result.error ? { reason: result.error } : {}),
          };
        } finally {
          clearTimeout(timeout);
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
