/**
 * Linux network control plane composition.
 *
 * Wires the concrete Linux data-plane components into the
 * {@link CanonicalNetworkControlPlane} contract consumed by
 * {@link ResilienceRuntime} via {@link CanonicalNetworkRuntimeAdapter}.
 *
 * This is the production composition for Linux: it creates a
 * {@link KernelRuntime} with the production routing contract registered, a
 * {@link RoutingEngine} with a real Linux route discovery/verification
 * provider, and a {@link ConnectivityManager} with configured connectivity
 * providers (including Starlink when reachable).
 *
 * This composition does NOT introduce a second control plane, policy engine,
 * safety engine, or transaction executor. It is the concrete data-plane wiring
 * behind the canonical {@link ResilienceRuntime}.
 */
import { KernelRuntime, type Principal } from '@irp/kernel';
import { ConnectivityManager, type ConnectivityProvider } from '@irp/connectivity';
import { RoutingEngine, type RouteDiscoveryProvider } from '@irp/routing';
import { MetricsRegistry } from '@irp/telemetry';
import type { LinuxRouteExecutor } from './linux-route-executor.js';
import type { CanonicalNetworkControlPlane } from '@irp/resilience-runtime';
export interface LinuxNetworkControlPlaneOptions {
    /**
     * If true, enables live route mutation via the kernel. If false (default),
     * the routing engine operates in observation/decision mode without applying
     * mutations — the runtime remains in simulation for the mutation step.
     */
    readonly enableLiveRouteMutation?: boolean;
    /** Network namespace for isolated execution (testing). */
    readonly netns?: string;
    /** Additional connectivity providers to register. */
    readonly connectivityProviders?: readonly ConnectivityProvider[];
    /**
     * Whether to register the Linux host connectivity provider. Default: true.
     * This discovers real network interfaces via `ip -j addr show` and exposes
     * them as canonical ConnectivityResource[] in the ConnectivityManager.
     */
    readonly registerHostConnectivity?: boolean;
    /** Whether to register the Starlink dish provider. Default: true. */
    readonly registerStarlink?: boolean;
    /** Starlink provider options (target, grpcurl, etc.) */
    readonly starlinkOptions?: {
        readonly target?: string;
        readonly grpcurlCommand?: string;
    };
    /** Custom route discovery provider (for testing). */
    readonly routeDiscoveryProvider?: RouteDiscoveryProvider;
    /**
     * Directory for durable state. When set, route mutations are journaled to
     * `<stateDirectory>/route-journal` before the kernel is touched so an interrupted mutation
     * can be rolled back after a crash. Without it the journal is in-memory only.
     */
    readonly stateDirectory?: string;
}
export interface LinuxNetworkControlPlane {
    readonly kernel: KernelRuntime;
    readonly routing: RoutingEngine;
    readonly connectivity: ConnectivityManager;
    readonly controlPlane: CanonicalNetworkControlPlane;
    /** Concrete route executor; call `recoverInterrupted()` once at startup. */
    readonly routeExecutor: LinuxRouteExecutor;
    /** The principal authorized for network.route capability. */
    readonly principal: Principal;
}
/**
 * Creates the production Linux network control plane.
 *
 * The control plane is returned as a {@link CanonicalNetworkControlPlane}
 * suitable for injection into {@link createCanonicalRuntime} via the
 * `networkControlPlane` option.
 */
export declare function createLinuxNetworkControlPlane(options?: LinuxNetworkControlPlaneOptions, metrics?: MetricsRegistry): LinuxNetworkControlPlane;
/**
 * Type guard for {@link CanonicalNetworkControlPlane} to satisfy the
 * `networkControlPlane` option of {@link createCanonicalRuntime}.
 */
export declare function isLinuxNetworkControlPlane(value: unknown): value is LinuxNetworkControlPlane;
