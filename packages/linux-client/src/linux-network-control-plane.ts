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

import {
  KernelRuntime,
  type Principal,
} from '@irp/kernel';
import {
  ConnectivityManager,
  type ConnectivityProvider,
} from '@irp/connectivity';
import { StarlinkProvider } from '@irp/connectivity/starlink';
import {
  RoutingEngine,
  type RouteDiscoveryProvider,
} from '@irp/routing';
import { MetricsRegistry } from '@irp/telemetry';
import { createLinuxRoutingContract } from './linux-routing-contract.js';
import { LinuxRouteDiscoveryProvider } from './linux-route-discovery.js';
import { LinuxHostConnectivityProvider } from './linux-host-connectivity-provider.js';
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
}

export interface LinuxNetworkControlPlane {
  readonly kernel: KernelRuntime;
  readonly routing: RoutingEngine;
  readonly connectivity: ConnectivityManager;
  readonly controlPlane: CanonicalNetworkControlPlane;
  /** The principal authorized for network.route capability. */
  readonly principal: Principal;
}

const NETWORK_ROUTE_PRINCIPAL: Principal = {
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
export function createLinuxNetworkControlPlane(
  options: LinuxNetworkControlPlaneOptions = {},
  metrics?: MetricsRegistry,
): LinuxNetworkControlPlane {
  const { enableLiveRouteMutation = false, netns, connectivityProviders = [] } = options;

  // 1. Create the kernel and register the production routing contract.
  const kernel = new KernelRuntime(undefined, NETWORK_ROUTE_PRINCIPAL);
  const { contract: routingContract } = createLinuxRoutingContract({
    ...(netns ? { netns } : {}),
  });
  kernel.registerContract(routingContract);

  // 2. Create the routing engine with the kernel (if live mutation enabled)
  //    and a real Linux route discovery provider.
  const routing = new RoutingEngine({
    ...(enableLiveRouteMutation ? { kernel } : {}),
    principal: NETWORK_ROUTE_PRINCIPAL,
    ...(metrics ? { metrics } : {}),
  });

  const discoveryProvider =
    options.routeDiscoveryProvider ??
    new LinuxRouteDiscoveryProvider({ ...(netns ? { netns } : {}) });
  routing.registerProvider(discoveryProvider);

  // 3. Create the connectivity manager and register providers.
  const connectivity = new ConnectivityManager({});

  const providers: ConnectivityProvider[] = [...connectivityProviders];

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
  const controlPlane: CanonicalNetworkControlPlane = {
    connectivity,
    routing,
    // destination is optional; the runtime supplies it per-cycle.
  };

  return {
    kernel,
    routing,
    connectivity,
    controlPlane,
    principal: NETWORK_ROUTE_PRINCIPAL,
  };
}

/**
 * Type guard for {@link CanonicalNetworkControlPlane} to satisfy the
 * `networkControlPlane` option of {@link createCanonicalRuntime}.
 */
export function isLinuxNetworkControlPlane(
  value: unknown,
): value is LinuxNetworkControlPlane {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kernel' in value &&
    'routing' in value &&
    'connectivity' in value &&
    'controlPlane' in value
  );
}
