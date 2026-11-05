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
import { KernelRuntime, } from '@irp/kernel';
import { ConnectivityManager, } from '@irp/connectivity';
import { StarlinkProvider } from '@irp/connectivity/starlink';
import { RoutingEngine, } from '@irp/routing';
import { join } from 'node:path';
import { createLinuxRoutingContract } from './linux-routing-contract.js';
import { FileRouteJournal } from './route-journal.js';
import { LinuxRouteDiscoveryProvider } from './linux-route-discovery.js';
import { LinuxHostConnectivityProvider } from './linux-host-connectivity-provider.js';
const NETWORK_ROUTE_PRINCIPAL = {
    id: 'linux-route-operator',
    capabilities: ['network.route', 'network.inspect'],
    metadata: { source: 'linux-network-control-plane' },
};
/**
 * Creates the production Linux network control plane.
 *
 * The control plane is returned as a {@link CanonicalNetworkControlPlane}
 * suitable for injection into {@link createCanonicalRuntime} via the
 * `networkControlPlane` option.
 */
export function createLinuxNetworkControlPlane(options = {}, metrics) {
    const { enableLiveRouteMutation = false, netns, connectivityProviders = [] } = options;
    // 1. Create the kernel and register the production routing contract.
    const kernel = new KernelRuntime(undefined, NETWORK_ROUTE_PRINCIPAL);
    const { contract: routingContract, executor: routeExecutor } = createLinuxRoutingContract({
        ...(netns ? { netns } : {}),
        ...(options.stateDirectory
            ? { journal: new FileRouteJournal(join(options.stateDirectory, 'route-journal')) }
            : {}),
    });
    kernel.registerContract(routingContract);
    // 2. Create the routing engine with the kernel (if live mutation enabled)
    //    and a real Linux route discovery provider.
    const routing = new RoutingEngine({
        ...(enableLiveRouteMutation ? { kernel } : {}),
        principal: NETWORK_ROUTE_PRINCIPAL,
        ...(metrics ? { metrics } : {}),
    });
    const discoveryProvider = options.routeDiscoveryProvider ??
        new LinuxRouteDiscoveryProvider({ ...(netns ? { netns } : {}) });
    routing.registerProvider(discoveryProvider);
    // 3. Create the connectivity manager and register providers.
    const connectivity = new ConnectivityManager({});
    const providers = [...connectivityProviders];
    // Register Linux host connectivity provider (real network interfaces).
    if (options.registerHostConnectivity !== false) {
        const hostProvider = new LinuxHostConnectivityProvider({
            ...(netns ? { netns } : {}),
        });
        providers.push(hostProvider);
    }
    // Register Starlink dish provider (monitor/health-check only).
    if (options.registerStarlink !== false) {
        const starlink = new StarlinkProvider({
            ...(options.starlinkOptions?.target
                ? { target: options.starlinkOptions.target }
                : {}),
            ...(options.starlinkOptions?.grpcurlCommand
                ? { grpcurlCommand: options.starlinkOptions.grpcurlCommand }
                : {}),
        });
        providers.push(starlink);
    }
    for (const provider of providers) {
        // registerProvider is async but we can fire-and-forget at composition time;
        // the runtime will discover resources when it runs a cycle.
        void connectivity.registerProvider(provider);
    }
    // 4. Assemble the CanonicalNetworkControlPlane.
    const controlPlane = {
        connectivity,
        routing,
        // destination is optional; the runtime supplies it per-cycle.
    };
    return {
        kernel,
        routing,
        connectivity,
        controlPlane,
        routeExecutor,
        principal: NETWORK_ROUTE_PRINCIPAL,
    };
}
/**
 * Type guard for {@link CanonicalNetworkControlPlane} to satisfy the
 * `networkControlPlane` option of {@link createCanonicalRuntime}.
 */
export function isLinuxNetworkControlPlane(value) {
    return (typeof value === 'object' &&
        value !== null &&
        'kernel' in value &&
        'routing' in value &&
        'connectivity' in value &&
        'controlPlane' in value);
}
