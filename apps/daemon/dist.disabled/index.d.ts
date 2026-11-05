import { Application, IntelligentDnsEngine } from '@irp/core';
import { ConnectivityManager } from '@irp/connectivity';
import { HttpAvailabilityProbe } from '@irp/network';
import { RoutingEngine } from '@irp/routing';
import { BoundedClosedLoopController, GatewayRegistrySelectionPlane, CanonicalDecisionProvider, NetworkEventStormGuard, ObservationDedupCache, RuntimeScheduler, TunnelRegistryControlPlane, type ClosedLoopOptions, type Observation, type ObservationProvider, type ObservationProviderResult, type RuntimeContext, type RuntimeSchedulerConfig } from '@irp/resilience-runtime';
import { NetworkSecurityProtectionEngine, type TrafficProtectionPolicy, type Phase18KillSwitch } from '@irp/security';
import { AutoOptimizationHost } from './auto-optimization-host.js';
import { PluginHost } from './plugin-host.js';
import { type HostAuthorization } from './host-authorization.js';
import { type ControlPort } from './control-server.js';
export declare class LinuxObservationProvider implements ObservationProvider {
    private readonly connectivity;
    readonly id = "linux-connectivity-observer";
    private readonly stormGuard;
    private readonly observationDedup;
    private lastObservations;
    constructor(connectivity: ConnectivityManager, options?: {
        readonly stormGuard?: NetworkEventStormGuard;
        readonly observationDedup?: ObservationDedupCache;
        /**
         * Deduplication window. Defaults to one full cycle interval so a repeated
         * reading across consecutive cycles is actually suppressed; a window
         * shorter than the interval can never observe a duplicate.
         */
        readonly dedupTtlMs?: number;
    });
    stormStatus(): Readonly<{
        admittedTotal: number;
        shedTotal: number;
        coolingDown: boolean;
    }>;
    /** Most recent admitted observations, for health classification. */
    observationsSnapshot(): readonly Observation[];
    dedupStatus(): Readonly<{
        keys: number;
        admittedTotal: number;
        duplicateHitsTotal: number;
    }>;
    observationDedupKey(observation: Observation): string;
    collect(context: RuntimeContext): Promise<ObservationProviderResult>;
}
export declare class RuntimeDaemonHost {
    lifecycle: 'created' | 'initialized' | 'ready' | 'running' | 'stopping' | 'stopped';
    /** Durable state root; undefined only for hermetic test runs that named no directory. */
    readonly stateDirectory: string | undefined;
    /** Fixed by daemon configuration. Nothing received over the control socket can change it. */
    readonly modeResolution: import("./daemon-config.js").DaemonModeResolution;
    /**
     * What this process is actually authorized to do: the operator's request intersected with
     * facts probed from the host (CAP_NET_ADMIN, iproute2, resolvectl, uid). Trust comes only from
     * here; a live request the host cannot honour degrades to safe and records why.
     */
    readonly authorization: HostAuthorization;
    /**
     * On Linux the daemon observes and routes through the real host composition: interface and
     * route discovery via iproute2, route mutation through the kernel contract (only when live
     * mutation is explicitly enabled) and an on-disk rollback journal. Other platforms keep an
     * empty manager, which reports "no sources" rather than inventing any.
     */
    private readonly linuxPlane;
    readonly connectivity: ConnectivityManager;
    readonly routing: RoutingEngine;
    private readonly dnsJournal;
    private readonly decisionStore;
    private readonly incidentStore;
    routeRecovery: Awaited<ReturnType<NonNullable<typeof this.linuxPlane>['routeExecutor']['recoverInterrupted']>> | undefined;
    private controlServer;
    readonly dnsProviders: import("@irp/dns").DnsProvider[];
    readonly dns: IntelligentDnsEngine;
    readonly observer: LinuxObservationProvider;
    readonly tunnelPlane: TunnelRegistryControlPlane;
    readonly gatewaySelection: GatewayRegistrySelectionPlane;
    readonly destinationProbe: HttpAvailabilityProbe | undefined;
    readonly decisionProvider: CanonicalDecisionProvider;
    readonly composition: import("@irp/resilience-runtime").CanonicalRuntimeComposition;
    readonly runtime: import("@irp/resilience-runtime").ResilienceRuntime;
    readonly plugins: PluginHost;
    readonly autoOptimization: AutoOptimizationHost;
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
    private readonly closedLoopAbortController;
    constructor(config?: Partial<RuntimeSchedulerConfig>);
    /**
     * Validated closed-loop options built from daemon environment configuration.
     * Values are validated so the loop cannot silently run unbounded.
     */
    getClosedLoopOptions(): ClosedLoopOptions;
    /**
     * Drives the canonical bounded closed loop using validated configuration.
     * Callers must handle `RangeError` from invalid configuration.
     */
    runClosedLoop(): Promise<ReturnType<BoundedClosedLoopController['run']>>;
    /** Abort the in-flight (or next) closed-loop cycle cooperatively. */
    abortClosedLoop(): void;
    private evaluatePathEvidence;
    private applyDnsProvider;
    /**
     * Linux capability negotiation stays inside the canonical runtime boundary.
     * The daemon advertises and checks only capabilities implemented by its
     * OS-specific adapters; unsupported work is denied with an explicit reason
     * instead of executing through another path.
     */
    platformNegotiation(requestedCapabilities?: readonly string[]): import("@irp/resilience-runtime").CapabilityNegotiation;
    /** Startup dependency failures are visible to operators; they never masquerade as healthy probes. */
    private readonly startupWarnings;
    initialize(): Promise<void>;
    start(): Promise<void>;
    /** Starts the owner-only control socket when a path is configured. */
    startControl(socketPath?: string | undefined): Promise<string | undefined>;
    controlPort(): ControlPort;
    /** Puts back the resolvers IRP replaced; a failure is reported, never hidden. */
    private restoreDns;
    stop(): Promise<void>;
    /**
     * Distinguishes daemon distress from network distress using scheduler,
     * telemetry, and process evidence. The daemon has no production queue, so
     * queue fields remain zero rather than inventing backpressure evidence.
     */
    selfHealth(): {
        failureClass: import("@irp/resilience-runtime").FailureClass;
        level: import("@irp/resilience-runtime").SelfHealthLevel;
        reasons: readonly string[];
    };
    health(): Promise<{
        lifecycle: "ready" | "initialized" | "created" | "running" | "stopping" | "stopped";
        startup: {
            warnings: string[];
        };
        scheduler: {
            lastFailure?: string;
            enabled: boolean;
            active: number;
            runsTotal: number;
            skippedTotal: number;
            overlapPreventedTotal: number;
            failedTotal: number;
        };
        runtimeId: string;
        instanceId: string;
        connectivityProviders: string[];
        connectivitySources: string[];
        dns: {
            providers: string[];
            activeProviderId: string | undefined;
        };
        gatewaySelection: {
            configured: boolean;
            currentGatewayId: string | undefined;
            gateways: number;
        };
        tunnel: {
            configured: boolean;
            activeTunnel: string | undefined;
        };
        plugins: {
            loaded: string[];
            active: string[];
        };
        autoOptimization: {
            bound: boolean;
            enabled: boolean;
        };
        self: {
            failureClass: import("@irp/resilience-runtime").FailureClass;
            level: import("@irp/resilience-runtime").SelfHealthLevel;
            reasons: readonly string[];
        };
        ingress: {
            storm: Readonly<{
                admittedTotal: number;
                shedTotal: number;
                coolingDown: boolean;
            }>;
            duplicates: Readonly<{
                keys: number;
                admittedTotal: number;
                duplicateHitsTotal: number;
            }>;
        };
        platform: import("@irp/resilience-runtime").CapabilityNegotiation;
        authorization: {
            requestedMode: import("@irp/resilience-runtime").RuntimeMode;
            effectiveMode: import("@irp/resilience-runtime").RuntimeMode;
            liveActive: boolean;
            hostGrantedCapabilities: readonly string[];
            hostAllowedActions: readonly import("@irp/resilience-runtime").ActionIntent[];
            blockers: readonly string[];
            evidence: {
                readonly platform: string;
                readonly euid: number | null;
                readonly capNetAdmin: boolean | null;
                readonly ipBinary: boolean;
                readonly resolvectl: boolean;
            };
        };
        storage: {
            persistent: boolean;
            stateDirectory: string | null;
            decisions: import("@irp/resilience-runtime").DurableLogStatus | {
                persistent: boolean;
            };
            incidents: import("@irp/resilience-runtime").DurableLogStatus | {
                persistent: boolean;
            };
        };
        recovery: {
            routeJournalEnabled: boolean;
            lastStartupRouteRecovery: import("@irp/linux-client").RouteRecoveryReport | null;
            dnsRestorePending: boolean;
        };
        capabilities: import("@irp/resilience-runtime").RuntimeAdapterDescriptor[];
        security: {
            state: import("@irp/security").NetworkSecurityState;
            protected: boolean;
            violations: {
                type: string;
                severity: string;
                reason: string;
            }[];
            killSwitch: {
                required: boolean;
                status: import("@irp/security").KillSwitchState | undefined;
            };
            tunnel: {
                required: boolean;
                status: "failed" | "degraded" | "unknown" | "recovering" | "connected" | "disconnected" | undefined;
            };
            dns: {
                required: boolean;
                status: string | undefined;
                throughTunnel: boolean;
            };
            timestamp: string;
        };
    }>;
    private buildSecurityStatus;
    private buildObservedNetworkState;
}
export declare const createDaemon: () => Application;
export declare const createRuntimeDaemonHost: (config?: Partial<RuntimeSchedulerConfig>) => RuntimeDaemonHost;
//# sourceMappingURL=index.d.ts.map