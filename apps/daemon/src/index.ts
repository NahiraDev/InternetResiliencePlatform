import { execFile } from 'node:child_process';
import { join } from 'node:path';
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
import { createLinuxNetworkControlPlane } from '@irp/linux-client';
import {
  BoundedClosedLoopController,
  GatewayRegistrySelectionPlane,
  CanonicalDecisionProvider,
  createCanonicalRuntime,
  type HostTrust,
  negotiatePlatformCapabilities,
  NetworkEventStormGuard,
  ObservationDedupCache,
  evaluateSelfHealth,
  classifyFailure,
  withOperationTimeout,
  RuntimeScheduler,
  FileDecisionStore,
  FileIncidentStore,
  TunnelRegistryControlPlane,
  type ClosedLoopOptions,
  type Observation,
  type ObservationProvider,
  type ObservationProviderResult,
  type PathStrategyEvidence,
  type RuntimeContext,
  type RuntimeSchedulerConfig,
} from '@irp/resilience-runtime';
import {
  NetworkSecurityProtectionEngine,
  type TrafficProtectionPolicy,
  type ObservedNetworkState,
  type Phase18KillSwitch,
  createTrafficProtectionPolicy,
  protectionProfileDefaults,
} from '@irp/security';
import { AutoOptimizationHost } from './auto-optimization-host.js';
import { PluginHost } from './plugin-host.js';
import { ControlServer, type ControlPort } from './control-server.js';
import { resolveControlSocketPath, resolveRuntimeMode, resolveStateDirectory } from './daemon-config.js';

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

/**
 * Trust the daemon host grants its own runtime. Observation and the safe
 * actions are always allowed; privileged network mutation capabilities and
 * intents exist only when the operator passed the live-mutation double
 * opt-in (IRP_RUNTIME_MODE=live and IRP_ENABLE_LIVE_ROUTE_MUTATION=true).
 */
export const daemonHostTrust = (liveMutation: boolean): HostTrust => ({
  principal: 'irp-daemon',
  capabilities: liveMutation
    ? ['network.observe', 'route.write', 'connectivity.failover', 'dns.write']
    : ['network.observe'],
  allowedActions: liveMutation
    ? ['health_reprobe', 'noop', 'degraded_mode', 'recovery', 'rollback', 'route_change', 'connectivity_failover', 'dns_switch']
    : ['health_reprobe', 'noop', 'degraded_mode', 'recovery', 'rollback'],
});

export class RuntimeDaemonHost {
  lifecycle: 'created' | 'initialized' | 'ready' | 'running' | 'stopping' | 'stopped' = 'created';
  /** Durable state root; undefined only for hermetic test runs that named no directory. */
  readonly stateDirectory = resolveStateDirectory(process.env);
  /** Fixed by daemon configuration. Nothing received over the control socket can change it. */
  readonly modeResolution = resolveRuntimeMode(process.env);
  /**
   * On Linux the daemon observes and routes through the real host composition: interface and
   * route discovery via iproute2, route mutation through the kernel contract (only when live
   * mutation is explicitly enabled) and an on-disk rollback journal. Other platforms keep an
   * empty manager, which reports "no sources" rather than inventing any.
   */
  private readonly linuxPlane =
    process.platform === 'linux'
      ? createLinuxNetworkControlPlane({
          enableLiveRouteMutation: this.modeResolution.liveRouteMutation,
          registerStarlink: process.env.IRP_STARLINK_ENABLED === '1',
          ...(this.stateDirectory ? { stateDirectory: this.stateDirectory } : {}),
        })
      : undefined;
  readonly connectivity = this.linuxPlane?.connectivity ?? new ConnectivityManager();
  readonly routing = this.linuxPlane?.routing ?? new RoutingEngine();
  private readonly decisionStore = this.stateDirectory
    ? new FileDecisionStore(join(this.stateDirectory, 'decisions.jsonl'))
    : undefined;
  private readonly incidentStore = this.stateDirectory
    ? new FileIncidentStore(join(this.stateDirectory, 'incidents.jsonl'))
    : undefined;
  routeRecovery: Awaited<ReturnType<NonNullable<typeof this.linuxPlane>['routeExecutor']['recoverInterrupted']>> | undefined;
  private controlServer: ControlServer | undefined;
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
    hostTrust: daemonHostTrust(this.modeResolution.liveRouteMutation),
    decisionProvider: this.decisionProvider,
    ...(this.decisionStore ? { decisionStore: this.decisionStore } : {}),
    ...(this.incidentStore ? { incidentStore: this.incidentStore } : {}),
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
  
  // Network security protection engine (Phase 18)
  readonly securityEngine: NetworkSecurityProtectionEngine;
  readonly trafficProtectionPolicy: TrafficProtectionPolicy;
  readonly killSwitchAdapter: Phase18KillSwitch;
  
  readonly scheduler: RuntimeScheduler;
  /**
   * Bounded closed-loop controller (Phase 78 / issue #11).
   *
   * This is the only repetition authority over the canonical runtime cycle.
   * It owns no decision, policy, execution, or safety semantics — those stay
   * owned by `ResilienceRuntime`. Bounds and stop conditions come from
   * environment-configured, validated options (IRP_LOOP_*). Safe-by-default
   * behavior remains one cycle per invocation when nothing is configured.
   */
  readonly closedLoop: BoundedClosedLoopController;
  private readonly closedLoopAbortController: AbortController;

  constructor(config: Partial<RuntimeSchedulerConfig> = {}) {
    this.scheduler = new RuntimeScheduler(this.runtime, {
      enabled: false,
      mode: this.modeResolution.mode,
      cycleIntervalMs: 30_000,
      maxConcurrentCycles: 1,
      cooldownMs: 5_000,
      executionBudgetMs: 10_000,
      ...config,
    });

    // Initialize traffic protection policy (Phase 18)
    this.trafficProtectionPolicy = createTrafficProtectionPolicy({
      version: 'daemon-runtime',
      securityProfile: 'secure',
      ...protectionProfileDefaults('secure'),
      requireTunnel: process.env.IRP_TUNNEL_ENABLED === '1',
      requireSecureDns: true,
      killSwitchRequired: process.env.IRP_TUNNEL_ENABLED === '1',
      blockOnDnsLeak: true,
      blockOnRouteLeak: true,
      blockOnTunnelFailure: true,
    });

    // Create event bus adapter for security engine
    const securityEventBus: { publish: (event: { id: string; type: string; aggregateId: string; occurredAt: Date; payload: Readonly<Record<string, unknown>>; metadata?: Record<string, string> }) => Promise<void> } = {
      publish: async (event) => {
        await this.runtime.events.emit(event.type, event.payload);
      },
    };

    // Create metrics adapter for security engine
    const securityMetrics: { record: (name: string, value: number, labels?: Record<string, string>) => void } = {
      record: (name: string, value: number, _labels?: Record<string, string>) => {
        this.runtime.telemetry.increment(name, value);
      },
    };

    // Create kill switch adapter that wraps the tunnel's nftables kill switch
    const tunnelKillSwitch = this.tunnelPlane.configured
      ? this.tunnelPlane.getKillSwitch()
      : undefined;
    this.killSwitchAdapter = tunnelKillSwitch
      ? {
          prepare: async () => {
            const status = await tunnelKillSwitch.status('daemon-tunnel');
            if (status === 'enabled') return 'enabled' as const;
            if (status === 'disabled') return 'disabled' as const;
            return 'unavailable' as const;
          },
          enable: async () => {
            const activeTunnel = this.tunnelPlane.activeTunnel;
            if (activeTunnel) {
              await tunnelKillSwitch.enable(activeTunnel);
              return 'enabled' as const;
            }
            return 'failed' as const;
          },
          disable: async () => {
            const activeTunnel = this.tunnelPlane.activeTunnel;
            if (activeTunnel) {
              await tunnelKillSwitch.disable(activeTunnel);
              return 'disabled' as const;
            }
            return 'unavailable' as const;
          },
          status: async () => {
            const activeTunnel = this.tunnelPlane.activeTunnel;
            if (activeTunnel) {
              const status = await tunnelKillSwitch.status(activeTunnel);
              if (status === 'enabled') return 'enabled' as const;
              if (status === 'disabled') return 'disabled' as const;
              return 'degraded' as const;
            }
            return 'disabled' as const;
          },
          validate: async () => {
            const activeTunnel = this.tunnelPlane.activeTunnel;
            if (!activeTunnel) return false;
            const status = await tunnelKillSwitch.status(activeTunnel);
            return status === 'enabled';
          },
        }
      : {
          prepare: async () => 'unavailable' as const,
          enable: async () => 'failed' as const,
          disable: async () => 'unavailable' as const,
          status: async () => 'unavailable' as const,
          validate: async () => false,
        };

    // Phase 78 / issue #11: the daemon exposes the canonical bounded closed
    // loop as the production repetition authority. Bounds come from validated
    // environment configuration; there is no default autonomous loop.
    this.closedLoopAbortController = new AbortController();
    this.closedLoop = new BoundedClosedLoopController(this.runtime);

    // Initialize network security protection engine
    this.securityEngine = new NetworkSecurityProtectionEngine(
      securityEventBus,
      securityMetrics,
      this.killSwitchAdapter,
      undefined, // platform adapter
    );
  }

  /**
   * Validated closed-loop options built from daemon environment configuration.
   * Values are validated so the loop cannot silently run unbounded.
   */
  getClosedLoopOptions(): ClosedLoopOptions {
    const maxCyclesRaw = process.env.IRP_LOOP_MAX_CYCLES;
    const intervalMsRaw = process.env.IRP_LOOP_INTERVAL_MS;
    const stopWhenHealthyRaw = process.env.IRP_LOOP_STOP_WHEN_HEALTHY;
    if (maxCyclesRaw === undefined && intervalMsRaw === undefined && stopWhenHealthyRaw === undefined)
      return { signal: this.closedLoopAbortController.signal };
    // Validate inputs. Out-of-range or invalid values fail closed by throwing —
    // the controller's own bound checks (`assertIntegerInRange`) already provide
    // the runtime guarantee; we mirror that for early validation.
    const maxCycles = maxCyclesRaw === undefined ? 1 : Number(maxCyclesRaw);
    if (!Number.isInteger(maxCycles) || maxCycles < 1 || maxCycles > 10)
      throw new RangeError(`IRP_LOOP_MAX_CYCLES must be an integer 1-10, got: ${maxCyclesRaw}`);
    const intervalMs = intervalMsRaw === undefined ? 0 : Number(intervalMsRaw);
    if (!Number.isInteger(intervalMs) || intervalMs < 0)
      throw new RangeError(`IRP_LOOP_INTERVAL_MS must be a non-negative integer, got: ${intervalMsRaw}`);
    if (
      stopWhenHealthyRaw !== undefined &&
      stopWhenHealthyRaw !== '0' &&
      stopWhenHealthyRaw !== '1'
    )
      throw new RangeError(`IRP_LOOP_STOP_WHEN_HEALTHY must be '0' or '1', got: ${stopWhenHealthyRaw}`);
    const stopWhenHealthy = stopWhenHealthyRaw === undefined ? true : stopWhenHealthyRaw === '1';
    return {
      maxCycles,
      intervalMs,
      stopWhenHealthy,
      signal: this.closedLoopAbortController.signal,
    };
  }

  /**
   * Drives the canonical bounded closed loop using validated configuration.
   * Callers must handle `RangeError` from invalid configuration.
   */
  async runClosedLoop(): Promise<ReturnType<BoundedClosedLoopController['run']>> {
    return this.closedLoop.run(this.getClosedLoopOptions());
  }

  /** Abort the in-flight (or next) closed-loop cycle cooperatively. */
  abortClosedLoop(): void {
    this.closedLoopAbortController.abort();
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
    // Before anything observes or mutates: undo any route change that was issued but never
    // verified because the previous process died. Failures are surfaced, not swallowed.
    if (this.linuxPlane) {
      this.routeRecovery = await this.linuxPlane.routeExecutor.recoverInterrupted();
      const r = this.routeRecovery;
      if (r.rolledBack.length || r.failed.length || r.corrupt.length || r.pruned.length)
        await this.runtime.events.emit('daemon.route-recovery', {
          rolledBack: r.rolledBack,
          failed: r.failed,
          corrupt: r.corrupt,
          pruned: r.pruned,
        });
    }
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
  /** Starts the owner-only control socket when a path is configured. */
  async startControl(socketPath = resolveControlSocketPath(process.env)): Promise<string | undefined> {
    if (!socketPath) return undefined;
    this.controlServer = new ControlServer(socketPath, this.controlPort());
    await this.controlServer.start();
    return socketPath;
  }

  controlPort(): ControlPort {
    return {
      health: () => this.health(),
      snapshot: () => this.runtime.getRuntimeSnapshot(),
      decisions: () => this.runtime.decisions.list(),
      incidents: () => this.runtime.incidents.list(),
      capabilities: () => this.runtime.capabilities(),
      // The requested mode is limited to simulation/safe by the control server; the daemon's
      // own configured mode is what the scheduler uses for live operation.
      cycle: (mode) => this.runtime.cycle({ mode }),
      reload: async () => {
        await this.connectivity.discoverResources();
        return { reloaded: true, sources: this.connectivity.getAvailableSources().length };
      },
    };
  }

  async stop() {
    this.lifecycle = 'stopping';
    this.scheduler.stop();
    await this.controlServer?.stop();
    await this.plugins.stop();
    this.decisionStore?.close();
    this.incidentStore?.close();
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
  async health() {
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
      security: await this.buildSecurityStatus(),
    };
  }

  private async buildSecurityStatus() {
    const observed = this.buildObservedNetworkState();
    const validation = await this.securityEngine.validateProtection({
      policy: this.trafficProtectionPolicy,
      observed,
    });
    return {
      state: validation.state,
      protected: validation.protected,
      violations: validation.violations.map((v: { type: string; severity: string; reason: string }) => ({
        type: v.type,
        severity: v.severity,
        reason: v.reason,
      })),
      killSwitch: {
        required: this.trafficProtectionPolicy.killSwitchRequired,
        status: observed.killSwitchState,
      },
      tunnel: {
        required: this.trafficProtectionPolicy.requireTunnel,
        status: observed.tunnelState,
      },
      dns: {
        required: this.trafficProtectionPolicy.requireSecureDns,
        status: observed.dnsTransport,
        throughTunnel: observed.dnsThroughTunnel,
      },
      timestamp: validation.timestamp,
    };
  }

  private buildObservedNetworkState(): ObservedNetworkState {
    const activeSource = this.connectivity.getActiveSource();
    const activeInterfaces = activeSource?.interfaceName ? [activeSource.interfaceName] : [];
    const activeRoutes = activeSource
      ? [
          {
            destination: '0.0.0.0/0',
            ...(activeSource.interfaceName !== undefined ? { interface: activeSource.interfaceName } : {}),
            route: activeSource.gateway ?? '',
            tunnel: this.tunnelPlane.activeTunnel ?? '',
            securityProfile: 'secure' as const,
            state: 'protected' as const,
            family: 'ipv4' as const,
          },
        ]
      : [];
    const dnsStatus = this.dns.status();
    const dnsResolvers = dnsStatus.providers.map((p) => p.provider.id);
    const dnsTransport = dnsStatus.activeProviderId ?? 'unknown';
    const tunnelState = this.tunnelPlane.activeTunnel ? 'connected' : 'disconnected';
    const killSwitchState = this.tunnelPlane.activeTunnel ? 'enabled' : 'disabled';

    const defaultRoute = activeRoutes[0] ?? {
      destination: '0.0.0.0/0',
      route: '',
      tunnel: '',
      securityProfile: 'secure' as const,
      state: 'protected' as const,
      family: 'ipv4' as const,
    };

    const baseObserved: Omit<ObservedNetworkState, 'dnsInterface' | 'defaultRoute' | 'tunnelId'> = {
      activeInterfaces,
      activeRoutes,
      dnsResolvers,
      dnsTransport,
      dnsThroughTunnel: this.tunnelPlane.activeTunnel !== undefined,
      tunnelState,
      ipv4Enabled: true,
      ipv6Enabled: true,
      killSwitchState,
      timestamp: new Date().toISOString(),
    };

    if (activeSource?.interfaceName !== undefined && defaultRoute && this.tunnelPlane.activeTunnel) {
      return { ...baseObserved, dnsInterface: activeSource.interfaceName, defaultRoute, tunnelId: this.tunnelPlane.activeTunnel };
    }
    if (activeSource?.interfaceName !== undefined && defaultRoute) {
      return { ...baseObserved, dnsInterface: activeSource.interfaceName, defaultRoute };
    }
    if (activeSource?.interfaceName !== undefined && this.tunnelPlane.activeTunnel) {
      return { ...baseObserved, dnsInterface: activeSource.interfaceName, tunnelId: this.tunnelPlane.activeTunnel };
    }
    if (defaultRoute && this.tunnelPlane.activeTunnel) {
      return { ...baseObserved, defaultRoute, tunnelId: this.tunnelPlane.activeTunnel };
    }
    if (activeSource?.interfaceName !== undefined) {
      return { ...baseObserved, dnsInterface: activeSource.interfaceName };
    }
    if (defaultRoute) {
      return { ...baseObserved, defaultRoute };
    }
    if (this.tunnelPlane.activeTunnel) {
      return { ...baseObserved, tunnelId: this.tunnelPlane.activeTunnel };
    }
    return baseObserved;
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
  const controlSocket = await host.startControl();
  daemon.logger.info('daemon ready', {
    mode: host.modeResolution.mode,
    stateDirectory: host.stateDirectory ?? 'memory-only',
    controlSocket: controlSocket ?? 'disabled',
    connectivitySources: host.connectivity.getAvailableSources().map((x) => x.sourceId),
    routeRecovery: host.routeRecovery ?? null,
  });
  // Issue #11 / Phase 78: when IRP_LOOP_* is set, the production entrypoint
  // drives the canonical bounded closed loop. It is cooperative: SIGTERM/SIGINT
  // aborts before the next cycle starts (BoundedClosedLoopController checks the
  // signal between cycles), and the scheduler stop in `host.stop()` handles the
  // ongoing scheduler. Failure of any cycle is not ignored: a `failed` or
  // `blocked` result ends the loop and surfaces via process exit code.
  if (
    process.env.IRP_LOOP_MAX_CYCLES !== undefined ||
    process.env.IRP_LOOP_INTERVAL_MS !== undefined
  ) {
    const runOneLoop = async (): Promise<void> => {
      const result = await host.runClosedLoop();
      daemon.logger.info('closed-loop result', {
        status: result.status,
        stopReason: result.stopReason,
        cyclesCompleted: result.cyclesCompleted,
      });
      if (result.status === 'failed' || result.status === 'blocked')
        throw new Error(`closed-loop terminated with status ${result.status}`);
    };
    void runOneLoop().catch((error: unknown) => {
      daemon.logger.error('closed-loop failed', { error: String(error) });
      process.exit(1);
    });
  }
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    daemon.logger.info('shutdown signal received', { signal });
    host.abortClosedLoop();
    await host.stop();
    await daemon.stop();
    process.exit(0);
  };
  process.on('SIGTERM', (signal) => void shutdown(signal));
  process.on('SIGINT', (signal) => void shutdown(signal));
  process.on('SIGHUP', () => void daemon.reload(loadConfig()));
}
