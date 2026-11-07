import type { ConnectivitySource } from '@irp/connectivity';
import type { KernelRuntime, Principal } from '@irp/kernel';
import type { MetricsRegistry } from '@irp/telemetry';
export type AddressFamily = 'ipv4' | 'ipv6' | 'dual';
export type RouteProtocol = 'static' | 'kernel' | 'provider' | 'policy' | 'plugin' | 'simulation';
export type RouteScope = 'global' | 'link' | 'host' | 'site' | 'custom';
export type RouteState = 'unknown' | 'available' | 'active' | 'degraded' | 'failed' | 'recovering' | 'disabled' | 'expired';
export type RouteTableKind = 'main' | 'local' | 'custom' | 'policy' | 'plugin';
export type PathType = 'direct' | 'vpn' | 'proxy' | 'tunnel' | 'relay' | 'overlay' | 'multi-hop' | 'custom';
export type PathCapability = 'ipv4' | 'ipv6' | 'tcp' | 'udp' | 'quic' | 'dns' | 'encrypted' | 'privacy-preserving' | 'low-latency' | 'high-bandwidth' | 'metered' | 'multipath' | string;
export type RoutingActionType = 'noop' | 'apply-route' | 'rollback-route' | 'verify-route';
export type CandidateDecision = 'eligible' | 'selected' | 'rejected';
export type DestinationRouteIntent = 'direct' | 'vpn-required' | 'vpn-preferred' | 'unknown';
export type CandidateRejectionReason = 'interface-unavailable' | 'provider-unavailable' | 'source-unavailable' | 'gateway-unreachable' | 'route-unhealthy' | 'wrong-address-family' | 'policy-prohibited' | 'capability-missing' | 'provider-disabled' | 'manual-override' | 'route-expired' | 'invalid-configuration' | 'no-destination-match' | 'flapping-stabilization' | 'unknown-path-type' | 'destination-requires-vpn';
export interface RoutingDestination {
    kind: 'ip' | 'cidr' | 'hostname' | 'service' | 'domain-profile' | 'network-segment' | 'default';
    value: string;
    family?: AddressFamily | undefined;
    port?: number | undefined;
    protocol?: string | undefined;
    profile?: string | undefined;
    application?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}
export interface RouteTable {
    id: string;
    kind: RouteTableKind;
    name: string;
    metadata?: Record<string, unknown> | undefined;
}
export interface RouteHealth {
    score: number;
    status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
    latencyMs?: number | undefined;
    packetLoss?: number | undefined;
    jitterMs?: number | undefined;
    stability?: number;
    gatewayReachable?: boolean;
    checkedAt: string;
}
export interface Route {
    id: string;
    destination: string;
    prefix: number;
    gateway?: string | undefined;
    interfaceName?: string | undefined;
    source?: string | undefined;
    protocol: RouteProtocol;
    metric: number;
    table: RouteTable;
    family: Exclude<AddressFamily, 'dual'>;
    scope: RouteScope;
    state: RouteState;
    health?: RouteHealth | undefined;
    priority: number;
    capabilities: PathCapability[];
    expiresAt?: string | undefined;
    metadata: Record<string, unknown>;
}
export interface DiscoveredRoute {
    id?: string;
    destination: string;
    prefix?: number;
    gateway?: string | undefined;
    interfaceName?: string | undefined;
    source?: string | undefined;
    protocol?: RouteProtocol | undefined;
    metric?: number;
    table?: Partial<RouteTable>;
    family?: AddressFamily | undefined;
    scope?: RouteScope;
    state?: RouteState;
    health?: Partial<RouteHealth> | undefined;
    priority?: number;
    capabilities?: PathCapability[];
    expiresAt?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}
export interface NetworkPath {
    id: string;
    type: PathType;
    source?: {
        providerId: string;
        resourceId: string;
    } | undefined;
    hops: string[];
    route: Route;
    provider?: string | undefined;
    capabilities: PathCapability[];
    health?: RouteHealth | undefined;
    score?: number | undefined;
    state: RouteState;
    metadata: Record<string, unknown>;
}
export type PathGraphNodeKind = 'path' | 'interface' | 'route' | 'gateway' | 'provider' | 'tunnel' | 'transport' | 'egress' | 'region' | 'destination';
export interface PathGraphNode {
    readonly id: string;
    readonly kind: PathGraphNodeKind;
    readonly state: RouteState;
    readonly metadata: Readonly<Record<string, unknown>>;
}
export type PathGraphEdgeKind = 'connected_to' | 'routes_through' | 'uses_gateway' | 'uses_provider' | 'uses_tunnel' | 'uses_transport' | 'egresses_through' | 'reaches' | 'depends_on';
export interface PathGraphEdge {
    readonly from: string;
    readonly to: string;
    readonly kind: PathGraphEdgeKind;
}
export interface PathGraphEvidence {
    readonly latencyMs?: number;
    readonly jitterMs?: number;
    readonly packetLoss?: number;
    readonly availability?: number;
    readonly reliability?: number;
    readonly confidence?: number;
    readonly freshness?: string;
    readonly security?: number;
    readonly trust?: number;
    readonly cost?: number;
    readonly failureDomains: readonly string[];
}
export interface PathGraphEntry {
    readonly path: NetworkPath;
    readonly evidence: PathGraphEvidence;
}
/** Read-only graph projection used by routing decisions; it has no mutation authority. */
export declare class NetworkPathGraph {
    readonly nodes: readonly PathGraphNode[];
    readonly edges: readonly PathGraphEdge[];
    readonly entries: readonly PathGraphEntry[];
    constructor(paths: readonly NetworkPath[], destination?: RoutingDestination);
    pathsFor(destination?: RoutingDestination): readonly NetworkPath[];
    usablePaths(destination?: RoutingDestination): readonly NetworkPath[];
    independentAlternatives(pathId: string, destination?: RoutingDestination): readonly NetworkPath[];
}
export declare const pathFailureDomains: (path: NetworkPath) => readonly string[];
export interface RouteCandidate {
    id: string;
    route: Route;
    path: NetworkPath;
    connectivitySource?: ConnectivitySource;
    gateway?: string | undefined;
    interfaceName?: string | undefined;
    healthScore: number;
    latencyMs?: number | undefined;
    packetLoss?: number | undefined;
    jitterMs?: number | undefined;
    stability: number;
    metric: number;
    policyScore: number;
    totalScore: number;
    eligibility: CandidateDecision;
    rejectionReason?: CandidateRejectionReason | undefined;
    explanation: string[];
    scoreComponents: Record<string, number>;
}
export interface RoutingPolicyContext {
    destination: RoutingDestination;
    route: Route;
    path: NetworkPath;
    source?: ConnectivitySource | undefined;
    profile?: string | undefined;
    manualOverride?: ManualRoutingOverride | undefined;
}
export interface RoutingPolicyDecision {
    allowed: boolean;
    reason?: string;
    scoreAdjustment?: number;
    requireCapabilities?: PathCapability[];
    denyCapabilities?: PathCapability[];
    preferFamily?: AddressFamily;
    requireProviderId?: string;
    requireInterface?: string;
    forceTableId?: string;
    constraints?: string[];
}
export interface RoutingPolicyProvider {
    evaluate(context: RoutingPolicyContext): Promise<RoutingPolicyDecision> | RoutingPolicyDecision;
}
export interface RoutingScoreFactor {
    id: string;
    weight: number;
    score(candidate: RouteCandidate, context: RoutingDecisionContext): number;
}
export interface RouteDiscoveryProvider {
    id: string;
    discoverRoutes(context: RoutingDecisionContext): Promise<DiscoveredRoute[]>;
    discoverPaths?(routes: Route[], context: RoutingDecisionContext): Promise<NetworkPath[]>;
    verify?(plan: RoutePlan): Promise<boolean>;
    /**
     * Confirms from observed system state that the plan's selected route is no longer installed
     * (rollback took effect). Distinct from `verify`, which confirms the route IS installed.
     */
    verifyRolledBack?(plan: RoutePlan): Promise<boolean>;
}
export interface RoutingPluginExtension {
    routeProviders?: RouteDiscoveryProvider[];
    scoringFactors?: RoutingScoreFactor[];
    policyProviders?: RoutingPolicyProvider[];
    verificationStrategies?: RouteDiscoveryProvider['verify'][];
}
export interface RoutingConfig {
    minimumHealthScore: number;
    minimumStabilityScore: number;
    maxLatencyMs: number;
    maxPacketLoss: number;
    hysteresis: number;
    cooldownMs: number;
    stabilityWindowMs: number;
    flappingThreshold: number;
    flappingWindowMs: number;
    failoverRetries: number;
    verificationTimeoutMs: number;
    addressFamilyPreference: AddressFamily;
    scoringWeights: Record<string, number>;
    allowedPathTypes: PathType[];
    maxHistory: number;
}
export interface ManualRoutingOverride {
    mode: 'prefer-path' | 'require-path' | 'deny-path' | 'prefer-interface' | 'prefer-provider' | 'prefer-family' | 'clear';
    target: string;
    reason: string;
    expiresAt?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}
export interface RoutingDecisionContext {
    destination: RoutingDestination;
    routes?: DiscoveredRoute[] | undefined;
    connectivitySources?: ConnectivitySource[] | undefined;
    profile?: string | undefined;
    currentPathId?: string | undefined;
    manualOverride?: ManualRoutingOverride | undefined;
    now?: Date | undefined;
    metadata?: Record<string, unknown> | undefined;
}
export interface RoutingExplanation {
    matchedRouteIds: string[];
    eligibleCandidateIds: string[];
    rejected: {
        candidateId: string;
        routeId: string;
        reason: CandidateRejectionReason;
        explanation: string[];
    }[];
    policy: RoutingPolicyDecision[];
    scores: Record<string, Record<string, number>>;
    selectedCandidateId?: string | undefined;
    reason: string;
    precedence: string[];
}
export interface RoutePlan {
    id: string;
    destination: RoutingDestination;
    currentPath?: NetworkPath | undefined;
    candidatePaths: NetworkPath[];
    selectedPath?: NetworkPath | undefined;
    reason: string;
    policy: RoutingPolicyDecision[];
    actions: {
        type: RoutingActionType;
        capability: 'network.route';
        input: unknown;
        description: string;
    }[];
    verification: {
        required: boolean;
        timeoutMs: number;
        strategy: 'provider' | 'kernel' | 'simulation';
        status: 'pending' | 'skipped' | 'succeeded' | 'failed';
    };
    explanation: RoutingExplanation;
    dryRun: boolean;
    createdAt: string;
}
export interface RoutingDecision {
    plan: RoutePlan;
    candidates: RouteCandidate[];
    selected?: RouteCandidate | undefined;
    graph: NetworkPathGraph;
    aiContext: Record<string, unknown>;
}
export declare const DEFAULT_ROUTING_CONFIG: RoutingConfig;
export declare function parseDestination(value: string): RoutingDestination;
export declare function normalizeRoute(input: DiscoveredRoute): Route;
export declare function routeMatchesDestination(route: Route, dest: RoutingDestination): boolean;
export declare function longestPrefix(routes: Route[], dest: RoutingDestination): Route[];
export declare class StaticRouteDiscoveryProvider implements RouteDiscoveryProvider {
    readonly id: string;
    private readonly routes;
    constructor(id: string, routes: DiscoveredRoute[]);
    discoverRoutes(): Promise<DiscoveredRoute[]>;
}
export declare class RoutingEngine {
    private readonly options;
    private readonly providers;
    private readonly policies;
    private readonly factors;
    private readonly active;
    private readonly transitions;
    private history;
    constructor(options?: {
        kernel?: KernelRuntime;
        principal?: Principal;
        metrics?: MetricsRegistry;
        config?: Partial<RoutingConfig>;
    });
    readonly config: RoutingConfig;
    registerProvider(provider: RouteDiscoveryProvider): void;
    registerPolicy(policy: RoutingPolicyProvider): void;
    registerScoreFactor(factor: RoutingScoreFactor): void;
    registerExtension(extension: RoutingPluginExtension): void;
    simulateRouting(context: RoutingDecisionContext): Promise<RoutingDecision>;
    decide(context: RoutingDecisionContext, dryRun?: boolean): Promise<RoutingDecision>;
    applyPlan(plan: RoutePlan): Promise<RoutePlan>;
    /**
     * Compensates a previously committed route transition using the plan's
     * captured currentPath. The kernel owns the privileged rollback; the active
     * path index is updated only after that operation succeeds.
     */
    rollbackPlan(plan: RoutePlan): Promise<boolean>;
    /**
     * Tells the kernel's routing capability that an applied plan has been verified end to end, so
     * its journal can stop treating it as interrupted. Returns false (never throws) when the kernel
     * cannot confirm; the plan then stays journaled as unconfirmed and a restart reverts it, which
     * is the safe direction.
     */
    confirmPlan(plan: RoutePlan): Promise<boolean>;
    /**
     * Proves a rollback from observed state. Fails closed: with no provider able to observe the
     * outcome, or if any provider errors or disagrees, the rollback is reported as unproven.
     */
    verifyRollback(plan: RoutePlan): Promise<boolean>;
    failover(context: RoutingDecisionContext): Promise<RoutePlan>;
    recover(context: RoutingDecisionContext): Promise<RoutePlan>;
    setManualOverride(context: RoutingDecisionContext, override: ManualRoutingOverride): RoutingDecisionContext;
    private discover;
    private paths;
    private candidate;
    private applyScores;
    private defaultFactors;
    private commit;
    private isFlapping;
    private emit;
    private metric;
    private key;
}
//# sourceMappingURL=index.d.ts.map