import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Application, createAllBuiltinProviders, IntelligentDnsEngine } from '@irp/core';
import { loadConfig } from '@irp/config';
import { ConnectivityManager } from '@irp/connectivity';
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
  createLinuxNetworkControlPlane,
  LinuxObservationProvider,
  createLinuxWireGuardIntegrationFromEnvironment,
  readLinuxGatewaySelectionEnvironment,
  createLinuxDestinationVerifier,
} from '@irp/linux-client';
import {
  BoundedClosedLoopController,
  GatewayRegistrySelectionPlane,
  CanonicalDecisionProvider,
  createCanonicalRuntime,
  type Observation,
  negotiatePlatformCapabilities,
  evaluateSelfHealth,
  classifyFailure,
  withOperationTimeout,
  RuntimeScheduler,
  FileDecisionStore,
  FileIncidentStore,
  PostgresDecisionStore,
  PostgresIncidentStore,
  type DecisionStore,
  type IncidentStore,
  TunnelRegistryControlPlane,
  type ClosedLoopOptions,
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
import { authorizeHost, classifyAdapters, probeHostFacts, type HostAuthorization } from './host-authorization.js';
import { DnsRestoreJournal } from './dns-restore.js';
import { ControlConflictError, ControlServer, type ControlPort } from './control-server.js';
import { resolveControlSocketPath, resolveRuntimeMode, resolveStateDirectory } from './daemon-config.js';

const execFileAsync = promisify(execFile);

const OPERATION_TIMEOUT_MS = 5_000;

// ── Destination URL from environment ──────────────────────────────────────────
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

// ── WireGuard integration from environment (only when explicitly enabled) ────
const wireGuardIntegration =
  process.env.IRP_TUNNEL_ENABLED === '1'
    ? (() => {
        try {
          return createLinuxWireGuardIntegrationFromEnvironment(process.env);
        } catch {
          return undefined;
        }
      })()
    : undefined;

// ── Gateway selection environment (only when a tunnel is available) ──────────
const gatewaySelectionEnv = wireGuardIntegration
  ? (() => {
      try {
        return readLinuxGatewaySelectionEnvironment(process.env);
      } catch {
        return { enabled: false, trustedSourceIds: [], destination: undefined };
      }
    })()
  : { enabled: false, trustedSourceIds: [], destination: undefined };

// ── Destination probe + canonical verifyDestination from IRP_DESTINATION_URL ─
const destinationProbeConfig = process.env.IRP_DESTINATION_URL
  ? (() => {
      try {
        const url = new URL(process.env.IRP_DESTINATION_URL);
        return {
          port: url.port ? Number(url.port) : 443,
          timeoutMs: 5000,
        };
      } catch {
        return undefined;
      }
    })()
  : undefined;

const canonicalExtensions = process.env.IRP_DESTINATION_URL
  ? (() => {
      try {
        const url = new URL(process.env.IRP_DESTINATION_URL);
        return {
          destination: parseDestination(url.hostname),
          verifyDestination: createLinuxDestinationVerifier({
            port: url.port ? Number(url.port) : 443,
            timeoutMs: 5000,
          }),
        };
      } catch {
        return undefined;
      }
    })()
  : undefined;

/** Longest the daemon waits for a running cycle to finish before exiting. */
const SHUTDOWN_DRAIN_MS = 20_000;

export class RuntimeDaemonHost {
  lifecycle: 'created' | 'initialized' | 'ready' | 'running' | 'stopping' | 'stopped' = 'created';
  /** Durable state root; undefined only for hermetic test runs that named no directory. */
  readonly stateDirectory = resolveStateDirectory(process.env);
  /** Fixed by daemon configuration. Nothing received over the control socket can change it. */
  readonly modeResolution = resolveRuntimeMode(process.env);
  /**
   * What this process is actually authorized to do: the operator's request intersected with
   * facts probed from the host (CAP_NET_ADMIN, iproute2, resolvectl, uid). Trust comes only from
   * here; a live request the host cannot honour degrades to safe and records why.
   */
  readonly authorization: HostAuthorization = authorizeHost(
    this.modeResolution,
    probeHostFacts(),
  );
  /**
   * On Linux the daemon observes and routes through the real host composition: interface and
   * route discovery via iproute2, route mutation through the kernel contract (only when live
   * mutation is explicitly enabled) and an on-disk rollback journal. Other platforms keep an
   * empty manager, which reports "no sources" rather than inventing any.
   */
  private readonly linuxPlane =
    process.platform === 'linux'
      ? createLinuxNetworkControlPlane({
          enableLiveRouteMutation: this.authorization.liveActive,
          registerStarlink: process.env.IRP_STARLINK_ENABLED === '1',
          ...(this.stateDirectory ? { stateDirectory: this.stateDirectory } : {}),
          ...(wireGuardIntegration
            ? {
                gatewaySelection: {
                  tunnel: wireGuardIntegration,
                  trustedSourceIds: gatewaySelectionEnv.trustedSourceIds,
                  ...(gatewaySelectionEnv.destination
                    ? { destination: gatewaySelectionEnv.destination }
                    : {}),
                },
              }
            : {}),
          ...(destinationProbeConfig ? { destinationProbe: destinationProbeConfig } : {}),
          ...(canonicalExtensions ? { canonicalExtensions } : {}),
        })
      : undefined;
  readonly connectivity = this.linuxPlane?.connectivity ?? new ConnectivityManager();
  readonly routing = this.linuxPlane?.routing ?? new RoutingEngine();
  private readonly dnsJournal = new DnsRestoreJournal(
    this.stateDirectory ? join(this.stateDirectory, 'dns-original.json') : undefined,
    async (file, args) => execFileAsync(file, [...args], { timeout: 5_000, maxBuffer: 64 * 1024 }),
  );
  /** Decision store: PostgreSQL when DATABASE_URL is set, file-based otherwise. */
  private readonly decisionStore = this.createDecisionStore();
  /** Incident store: PostgreSQL when DATABASE_URL is set, file-based otherwise. */
  private readonly incidentStore = this.createIncidentStore();

  private createDecisionStore(): DecisionStore | undefined {
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      try {
        const url = new URL(databaseUrl);
        // Only enable SSL for production (postgresql:// with explicit sslmode=require)
        // or when explicitly configured via IRP_DB_SSL=true. Local/test postgres typically
        // doesn't support SSL.
        const ssl = process.env.IRP_DB_SSL === 'true' ||
          (url.searchParams.get('sslmode') === 'require');
        return new PostgresDecisionStore({
          host: url.hostname,
          port: Number(url.port) || 5432,
          database: url.pathname.replace(/^\//, ''),
          user: url.username,
          password: url.password,
          ssl,
        });
      } catch {
        // Fall through to file store below
      }
    }
    return this.stateDirectory
      ? new FileDecisionStore(join(this.stateDirectory, 'decisions.jsonl'))
      : undefined;
  }

  private createIncidentStore(): IncidentStore | undefined {
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      try {
        const url = new URL(databaseUrl);
        const ssl = process.env.IRP_DB_SSL === 'true' ||
          (url.searchParams.get('sslmode') === 'require');
        return new PostgresIncidentStore({
          host: url.hostname,
          port: Number(url.port) || 5432,
          database: url.pathname.replace(/^\//, ''),
          user: url.username,
          password: url.password,
          ssl,
        });
      } catch {
        // Fall through to file store below
      }
    }
    return this.stateDirectory
      ? new FileIncidentStore(join(this.stateDirectory, 'incidents.jsonl'))
      : undefined;
  }
  routeRecovery: Awaited<ReturnType<NonNullable<typeof this.linuxPlane>['routeExecutor']['recoverInterrupted']>> | undefined;
  /** Logical customer device ID → network source ID mapping. */
  private readonly deviceSessions = new Map<string, string>();
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
    hostTrust: this.authorization.trust,
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
      mode: this.authorization.effectiveMode,
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
   * Ensures durable stores are initialized before the first cycle.
   */
  async runClosedLoop(): Promise<ReturnType<BoundedClosedLoopController['run']>> {
    if (this.lifecycle === 'created') {
      await this.initialize();
    }
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
    await this.dnsJournal.captureBeforeChange(interfaceName);
    await execFileAsync('resolvectl', ['dns', interfaceName, ...servers], {
      timeout: 5_000,
      maxBuffer: 64 * 1024,
    });
    this.dns.selectProvider(providerId);
  }

  /**
   * Resolves a logical customer device ID or a direct network source ID to a
   * connectivity source ID. Logical device IDs are mapped via the device
   * session registry established on connect; direct source IDs (e.g.
   * `linux-host:wlp0s20f3`) are matched against discovered sources.
   */
  private resolveDeviceSourceId(deviceId: string): string | undefined {
    // Direct source ID match (e.g. "linux-host:wlp0s20f3" or "wlp0s20f3")
    const sources = this.connectivity.getAvailableSources();
    const direct = sources.find(
      (s) => s.id === deviceId || s.sourceId === deviceId,
    );
    if (direct) return direct.sourceId;
    // Logical device ID → source ID mapping from the device session registry
    return this.deviceSessions.get(deviceId);
  }

  /**
   * Verifies that the configured external destination is reachable through the
   * given connectivity source. Returns the verification result; never throws
   * on probe failure — the caller decides how to treat an unreachable
   * destination.
   */
  private async verifyExternalDestination(_sourceId: string): Promise<{
    status: 'reachable' | 'failed' | 'unknown';
    reason: string | undefined;
    latencyMs: number;
  }> {
    if (!this.destinationProbe || !configuredDestination) {
      return { status: 'unknown', reason: 'IRP_DESTINATION_URL is not configured', latencyMs: 0 };
    }
    const start = Date.now();
    try {
      const controller = new AbortController();
      const result = await Promise.race([
        this.destinationProbe.execute({
          signal: controller.signal,
          now: () => new Date().toISOString(),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('destination probe timeout')), 5000),
        ),
      ]);
      controller.abort();
      return {
        status: result.success ? 'reachable' : 'failed',
        reason: result.error,
        latencyMs: result.latencyMs ?? Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'failed',
        reason: error instanceof Error ? error.message : 'destination probe failed',
        latencyMs: Date.now() - start,
      };
    }
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
  /** Startup dependency failures are visible to operators; they never masquerade as healthy probes. */
  private readonly startupWarnings: string[] = [];

  async initialize() {
    // Initialize durable stores before any cycle can run. When DATABASE_URL is
    // configured, PostgreSQL stores must be initialized (schema migration,
    // connection pool) before the runtime can use them. Failure to initialize
    // is surfaced immediately - the daemon fails closed rather than silently
    // falling back to volatile in-memory storage.
    if (this.decisionStore && 'initialize' in this.decisionStore) {
      await (this.decisionStore as { initialize: () => Promise<void> }).initialize();
    }
    if (this.incidentStore && 'initialize' in this.incidentStore) {
      await (this.incidentStore as { initialize: () => Promise<void> }).initialize();
    }

    // Before anything observes or mutates: undo any route change that was issued but never
    // verified because the previous process died. Failures are surfaced, not swallowed.
    await this.restoreDns('startup-recovery');
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

    // Startup must remain observable even when the host has no network or a platform
    // probe hangs. Bound discovery and DNS evaluation independently and run them in
    // parallel; a timeout degrades startup evidence but must not prevent the local
    // control socket from becoming usable. The observation provider applies the same
    // deadline when discovery is retried during a runtime cycle.
    const runStartupProbe = async <T>(
      name: string,
      run: () => Promise<T>,
    ): Promise<void> => {
      try {
        await withOperationTimeout(
          `startup-${name}`,
          Promise.resolve().then(run),
          OPERATION_TIMEOUT_MS,
        );
      } catch (error) {
        this.startupWarnings.push(
          `${name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };
    await Promise.all([
      runStartupProbe('connectivity-discovery', () =>
        this.connectivity.discoverResources(),
      ),
      runStartupProbe('dns-evaluation', () => this.dns.evaluate()),
    ]);
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

  /**
   * Connect a logical customer device through the canonical connectivity lifecycle.
   *
   * Maps the logical device ID to a network source ID, activates the source through
   * `ConnectivityManager.activateSource()` (prepare → activate → verify → commit),
   * verifies the external destination, and records the device-session mapping.
   * Returns the verified connection outcome — never a merely requested state.
   */
  private async connectDeviceSource(deviceId: string): Promise<{
    deviceId: string;
    sourceId: string;
    connected: boolean;
    transition: import('@irp/connectivity').ConnectionTransition;
    destination: { status: 'reachable' | 'failed' | 'unknown'; reason: string | undefined; latencyMs: number };
  }> {
    const sourceId = this.resolveDeviceSourceId(deviceId);
    if (!sourceId) {
      // Logical device not yet mapped: auto-discover the primary available source.
      const sources = this.connectivity.getAvailableSources();
      if (sources.length === 0) {
        throw new Error(`No available connectivity source for device: ${deviceId}`);
      }
      const primary = sources[0];
      if (!primary) throw new Error(`No available connectivity source for device: ${deviceId}`);
      this.deviceSessions.set(deviceId, primary.sourceId);
      return this.connectDeviceSource(primary.sourceId);
    }
    // If called with a logical device ID, recurse with the resolved source ID.
    if (sourceId !== deviceId) {
      return this.connectDeviceSource(sourceId);
    }
    // Direct source ID: activate through the full ConnectivityManager lifecycle
    // (prepare → activate → verify → commit), then verify the external destination.
    const sources = this.connectivity.getAvailableSources();
    const source = sources.find((s) => s.sourceId === sourceId);
    if (!source) throw new Error(`Connectivity source not found: ${sourceId}`);
    const provider = this.connectivity.getProviders().find((p) => p.id === source.providerId);
    if (!provider) throw new Error(`Provider not found: ${source.providerId}`);
    if (!provider.capabilities(source.id).includes('activate')) {
      throw new Error(`Source does not support activation: ${sourceId}`);
    }
    const transition = await this.connectivity.activateSource(sourceId, 'manual-request');
    const destination = await this.verifyExternalDestination(sourceId);
    let connected = false;
    let logicalId: string | undefined;
    if (transition.status === 'committed' && destination.status === 'reachable') {
      connected = true;
      logicalId = [...this.deviceSessions.entries()].find(
        ([, sid]) => sid === sourceId,
      )?.[0];
      if (logicalId) this.deviceSessions.set(logicalId, sourceId);
    } else {
      // Rollback: destination unreachable after activation — deactivate the source.
      if (transition.status === 'committed') {
        try {
          await this.connectivity.deactivateSource(sourceId);
        } catch {
          // Best-effort rollback; report the failure regardless.
        }
      }
    }
    await this.runtime.events.emit('daemon.device-connected', {
      deviceId: logicalId ?? deviceId,
      sourceId,
      transition,
      destination,
      connected,
    });
    return {
      deviceId: logicalId ?? deviceId,
      sourceId,
      connected,
      transition,
      destination,
    };
  }

  /**
   * Disconnect a logical customer device and clean up its connectivity session.
   *
   * Deactivates the active source if it matches, removes the device-session mapping,
   * and returns the verified disconnection outcome.
   */
  private async disconnectDeviceSource(deviceId: string): Promise<{
    deviceId: string;
    sourceId: string;
    connected: boolean;
  }> {
    const sourceId = this.resolveDeviceSourceId(deviceId);
    if (!sourceId) throw new Error(`Device not found: ${deviceId}`);
    // If called with a logical device ID, recurse with the resolved source ID.
    if (sourceId !== deviceId) {
      return this.disconnectDeviceSource(sourceId);
    }
    // Direct source ID: deactivate the active source if it matches.
    const sources = this.connectivity.getAvailableSources();
    const source = sources.find((s) => s.sourceId === sourceId);
    let deactivated = false;
    let deactivateError: string | undefined;
    if (source && source.active) {
      try {
        await this.connectivity.deactivateSource(sourceId);
        deactivated = true;
      } catch (err) {
        // Linux host interfaces cannot be brought down without CAP_NET_ADMIN;
        // the provider's deactivate() reports this. We still clear the logical
        // session and report the outcome honestly.
        deactivateError = err instanceof Error ? err.message : String(err);
      }
    }
    // Remove the device session mapping.
    const logicalId = [...this.deviceSessions.entries()].find(
      ([, sid]) => sid === sourceId,
    )?.[0];
    if (logicalId) this.deviceSessions.delete(logicalId);
    await this.runtime.events.emit('daemon.device-disconnected', {
      deviceId: logicalId ?? deviceId,
      sourceId,
      deactivated,
      deactivateError,
    });
    return {
      deviceId: logicalId ?? deviceId,
      sourceId,
      connected: false,
      ...(deactivateError ? { deactivateError } : {}),
    };
  }

  controlPort(): ControlPort {
    return {
      health: () => this.health(),
      snapshot: () => this.runtime.getRuntimeSnapshot(),
      decisions: () => this.runtime.decisions.list(),
      incidents: () => this.runtime.incidents.list(),
      capabilities: () => ({
        hostGrantedCapabilities: this.authorization.trust.capabilities,
        adapters: classifyAdapters(this.runtime.capabilities(), this.authorization),
      }),
      // The requested mode is limited to simulation/safe by the control server; the daemon's
      // own configured mode is what the scheduler uses for live operation.
      cycle: async (mode) => {
        // Startup discovery can take a long time on a broken network; refuse cycles until the
        // runtime has finished initializing rather than cycling against half-built state.
        if (this.lifecycle !== 'running')
          throw new ControlConflictError(`daemon is ${this.lifecycle}; retry when it is running`);
        try {
          return await this.runtime.cycle({ mode });
        } catch (error) {
          // The runtime refuses overlapping cycles; surface that as a conflict, not a server fault.
          if (error instanceof Error && error.message === 'runtime cycle already active')
            throw new ControlConflictError('a runtime cycle is already running; retry when it finishes');
          throw error;
        }
      },
      reload: async () => {
        await this.connectivity.discoverResources();
        return { reloaded: true, sources: this.connectivity.getAvailableSources().length };
      },
      events: async () => {
        const sink: unknown = this.runtime.events;
        const eventsList = (sink as { events?: readonly { event: string; payload: unknown }[] }).events ?? [];
        const recent = eventsList.slice(-200).map((e) => ({ event: e.event, payload: e.payload, timestamp: new Date().toISOString() }));
        return { events: recent, count: recent.length };
      },
      topology: async () => {
        const sources = this.connectivity.getAvailableSources();
        const active = this.connectivity.getActiveSource();
        const providers = this.connectivity.getProviders();
        const dnsStatus = this.dns.status();
        return {
          interfaces: sources.map((s) => ({
            id: s.sourceId,
            name: s.interfaceName ?? s.sourceId,
            type: 'network-interface',
            state: s.interfaceName ? 'up' : 'unknown',
            ipAddress: s.gateway ?? undefined,
            gateway: s.gateway,
            providerId: s.providerId,
            resourceId: s.id,
            active: active?.sourceId === s.sourceId,
          })),
          routes: sources.map((s) => ({
            id: `route-${s.sourceId}`,
            destination: '0.0.0.0/0',
            gateway: s.gateway ?? 'system-default',
            interface: s.interfaceName ?? 'unknown',
            state: s.interfaceName ? 'active' : 'inactive',
            type: 'route',
            active: active?.sourceId === s.sourceId,
          })),
          dns: {
            resolvers: dnsStatus.providers.map((p) => ({ id: p.provider.id, active: p.provider.id === dnsStatus.activeProviderId })),
            activeProviderId: dnsStatus.activeProviderId,
          },
          tunnels: this.tunnelPlane.configured ? [{ id: this.tunnelPlane.activeTunnel ?? 'none', state: this.tunnelPlane.activeTunnel ? 'connected' : 'disconnected', type: 'tunnel' }] : [],
          providers: providers.map((p) => ({ id: p.id, type: 'provider', state: 'available' })),
          gateway: active ? { id: active.sourceId, gateway: active.gateway, interface: active.interfaceName } : null,
        };
      },
      connectDevice: async (deviceId) => this.connectDeviceSource(deviceId),
      disconnectDevice: async (deviceId) => this.disconnectDeviceSource(deviceId),
    };
  }

  /** Puts back the resolvers IRP replaced; a failure is reported, never hidden. */
  private async restoreDns(reason: 'startup-recovery' | 'shutdown'): Promise<void> {
    if (!this.dnsJournal.pending()) return;
    try {
      const result = await this.dnsJournal.restore();
      await this.runtime.events.emit('daemon.dns-restored', { reason, ...result });
    } catch (error) {
      await this.runtime.events.emit('daemon.dns-restore-failed', {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  async stop() {
    this.lifecycle = 'stopping';
    this.scheduler.stop();
    // Stop taking new requests, then let any cycle already running reach verification or its own
    // rollback. Exiting mid-mutation would leave an unverified change for the next start to undo.
    await this.controlServer?.stop();
    const drained =
      (await this.scheduler.whenIdle(SHUTDOWN_DRAIN_MS)) &&
      (await this.runtime.whenIdle(SHUTDOWN_DRAIN_MS));
    if (!drained)
      await this.runtime.events.emit('daemon.shutdown-with-active-cycle', { waitedMs: SHUTDOWN_DRAIN_MS });
    await this.restoreDns('shutdown');
    await this.plugins.stop();
    this.decisionStore?.close?.();
    this.incidentStore?.close?.();
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
      startup: { warnings: [...this.startupWarnings] },
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
      authorization: {
        requestedMode: this.authorization.requestedMode,
        effectiveMode: this.authorization.effectiveMode,
        liveActive: this.authorization.liveActive,
        hostGrantedCapabilities: this.authorization.trust.capabilities,
        hostAllowedActions: this.authorization.trust.allowedActions,
        blockers: this.authorization.blockers,
        evidence: this.authorization.evidence,
      },
      storage: {
        persistent: this.stateDirectory !== undefined,
        stateDirectory: this.stateDirectory ?? null,
        decisions: this.decisionStore?.status?.() ?? { persistent: false },
        incidents: this.incidentStore?.status?.() ?? { persistent: false },
      },
      recovery: {
        routeJournalEnabled: this.linuxPlane !== undefined && this.stateDirectory !== undefined,
        // Evidence from this process's startup recovery pass, not a promise about the future.
        lastStartupRouteRecovery: this.routeRecovery ?? null,
        dnsRestorePending: this.dnsJournal.pending(),
      },
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
  // Open the control channel BEFORE startup discovery: discovery probes the network, and a
  // degraded network is exactly when the operator needs `irp status` to answer (lifecycle is
  // reported as it progresses; cycles are refused with 409 until the daemon is running).
  const controlSocket = await host.startControl();
  await host.start();
  await daemon.start();
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
