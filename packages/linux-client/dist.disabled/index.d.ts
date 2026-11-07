import type { AddressInfo } from 'node:net';
import { type CanonicalRuntimeComposition, type ClosedLoopResult, ResilienceRuntime, type ObservationProvider, type ObservationProviderResult, type RuntimeAdapterDescriptor, type RuntimeContext, type RuntimeSnapshot } from '@irp/resilience-runtime';
import { type LinuxNetworkControlPlane } from './linux-network-control-plane.js';
export type NetworkSnapshot = {
    interfaces: string;
    routes: string;
    dns: string;
    capturedAt: string;
};
export type ClientPolicy = {
    autonomousMode: boolean;
    preferredInterface?: string;
};
export interface LinuxSystemAdapter {
    snapshot(): Promise<NetworkSnapshot>;
    setAutonomousMode(enabled: boolean): Promise<void>;
    getPolicy(): ClientPolicy;
}
export declare class LinuxSystem implements LinuxSystemAdapter {
    private policy;
    snapshot(): Promise<NetworkSnapshot>;
    setAutonomousMode(enabled: boolean): Promise<void>;
    getPolicy(): ClientPolicy;
}
/**
 * Converts non-mutating Linux diagnostics into canonical runtime observations.
 * The provider has no execution authority; all mutations remain behind
 * ResilienceRuntime's policy, safety, transaction and verification boundaries.
 */
export declare class LinuxSnapshotObservationProvider implements ObservationProvider {
    private readonly system;
    readonly id = "linux-client-diagnostics";
    constructor(system: Pick<LinuxSystemAdapter, 'snapshot'>);
    collect(context: RuntimeContext): Promise<ObservationProviderResult>;
}
export type LinuxCapabilityStatus = {
    adapterId: string;
    subsystem: RuntimeAdapterDescriptor['subsystem'];
    status: 'registered' | 'live' | 'simulation-only';
    supportsSafe: boolean;
    supportsLive: boolean;
    verificationSupport: boolean;
    recoverySupport: boolean;
};
export type LinuxRuntimeStatus = {
    runtime: RuntimeSnapshot;
    autonomousMode: boolean;
    lastAutonomyCycle?: ClosedLoopResult;
    capabilities: readonly RuntimeAdapterDescriptor[];
    capabilityStatus: readonly LinuxCapabilityStatus[];
};
/** The Linux client runtime for the canonical, safe-by-default composition. */
export declare class LinuxClientRuntime {
    readonly runtime: ResilienceRuntime;
    private started;
    private autonomousMode;
    private lastAutonomyCycle;
    private readonly composition;
    constructor(system: Pick<LinuxSystemAdapter, 'snapshot'>, composition?: CanonicalRuntimeComposition);
    start(): Promise<void>;
    setAutonomousMode(enabled: boolean): Promise<void>;
    status(): Promise<LinuxRuntimeStatus>;
}
/**
 * Production Linux client runtime.
 *
 * Unlike {@link LinuxClientRuntime} (which defaults to simulation), this
 * runtime wires a real {@link KernelRuntime} with the production routing
 * contract, a {@link RoutingEngine} with real Linux route discovery, and a
 * {@link ConnectivityManager} with configured providers (including
 * Starlink). It uses `executionMode: 'real'` and passes the
 * {@link CanonicalNetworkControlPlane} into {@link createCanonicalRuntime}
 * so the {@link CanonicalNetworkRuntimeAdapter} is registered with
 * `supportsLive: true`.
 *
 * The production runtime does NOT bypass the canonical mutation boundary.
 * All mutations still flow through the canonical runtime and its privileged
 * mutation boundary before reaching the kernel routing contract and the
 * Linux route executor.
 */
export declare class LinuxProductionRuntime {
    readonly runtime: ResilienceRuntime;
    private started;
    private autonomousMode;
    private lastAutonomyCycle;
    readonly composition: CanonicalRuntimeComposition;
    readonly controlPlane: LinuxNetworkControlPlane;
    constructor(system: Pick<LinuxSystemAdapter, 'snapshot'>, options?: {
        readonly enableLiveRouteMutation?: boolean;
        readonly executionMode?: import('@irp/resilience-runtime').CanonicalExecutionMode;
        readonly netns?: string;
        readonly connectivityProviders?: readonly import('@irp/connectivity').ConnectivityProvider[];
        readonly registerStarlink?: boolean;
        readonly starlinkOptions?: {
            readonly target?: string;
            readonly grpcurlCommand?: string;
        };
        readonly composition?: CanonicalRuntimeComposition;
    });
    start(): Promise<void>;
    setAutonomousMode(enabled: boolean): Promise<void>;
    status(): Promise<LinuxRuntimeStatus>;
    /**
     * Exposes whether the production routing contract is registered and the
     * canonical network adapter supports live execution.
     */
    getRouteMutationCapability(): {
        readonly kernelId: string;
        readonly routingContractRegistered: boolean;
        readonly liveRouteMutationEnabled: boolean;
        readonly capabilityStatus: readonly LinuxCapabilityStatus[];
    };
}
/** Shared interface for runtime implementations usable by the server. */
export interface LinuxRuntime {
    start(): Promise<void>;
    status(): Promise<LinuxRuntimeStatus>;
    setAutonomousMode(enabled: boolean): Promise<void>;
}
export declare class LinuxClientServer {
    private readonly system;
    private readonly runtime;
    private readonly controlToken?;
    private readonly server;
    private port;
    /**
     * @param controlToken Bearer token required for state changes. When undefined, `POST /policy`
     *   is disabled (fail-closed): the page stays readable but nothing can be changed over HTTP.
     */
    constructor(system: LinuxSystemAdapter, runtime?: LinuxRuntime, controlToken?: string | undefined);
    start(port?: number, host?: string): Promise<void>;
    address(): string | AddressInfo | null;
    stop(): Promise<void>;
    private refuse;
    private handle;
}
export declare function runLinuxClient(): Promise<LinuxClientServer>;
export * from './route-journal.js';
export * from './linux-network-control-plane.js';
export * from './linux-route-executor.js';
