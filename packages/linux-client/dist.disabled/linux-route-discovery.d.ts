/**
 * Real Linux route discovery and verification provider.
 *
 * Reads actual `ip -j route show` output and converts it into
 * {@link DiscoveredRoute}[] for the {@link RoutingEngine}. Also implements
 * the `verify` contract so the routing engine can confirm an applied plan
 * took effect by observing the resulting route state.
 *
 * This provider has NO mutation authority. It only observes.
 */
import { type DiscoveredRoute, type RouteDiscoveryProvider, type RoutePlan, type RoutingDecisionContext } from '@irp/routing';
export declare const IP_BINARY = "ip";
export declare const DEFAULT_TIMEOUT_MS = 5000;
interface IpRouteJson {
    readonly dst?: string;
    readonly gateway?: string;
    readonly dev?: string;
    readonly src?: string;
    readonly protocol?: string;
    readonly metric?: number;
    readonly scope?: string;
    readonly table?: string;
    readonly flags?: readonly unknown[];
}
/**
 * Converts a single `ip -j route show` JSON entry into a
 * {@link DiscoveredRoute}.
 */
export declare function ipRouteToDiscovered(raw: IpRouteJson): DiscoveredRoute;
/**
 * Real Linux route discovery provider.
 *
 * Reads `ip -j route show` (all tables) and converts the output into
 * {@link DiscoveredRoute}[] for the routing engine.
 */
export declare class LinuxRouteDiscoveryProvider implements RouteDiscoveryProvider {
    private readonly options;
    readonly id = "linux-route-discovery";
    constructor(options?: {
        readonly netns?: string;
        readonly timeoutMs?: number;
        readonly commandRunner?: {
            run(binary: string, args: readonly string[], options: {
                timeoutMs: number;
            }): Promise<{
                stdout: string;
                stderr: string;
                exitCode: number;
            }>;
        };
    });
    private run;
    discoverRoutes(_context: RoutingDecisionContext): Promise<DiscoveredRoute[]>;
    /**
     * Verifies that an applied route plan's target route exists in the kernel
     * routing table.
     */
    verify(plan: RoutePlan): Promise<boolean>;
}
export {};
