import type { NetworkPathGraph } from '@irp/routing';
import { FabricCapabilityAuthority, type CapabilityDecision, type FabricPlatform } from './fabric-authority.js';
import { type DiverseSelection, type FreshnessReport } from './fabric-lifecycle.js';
import type { CompiledIntent } from './domain/types.js';
export declare const FABRIC_RESOURCE_KINDS: readonly ["Device", "Interface", "Link", "Provider", "Gateway", "Route", "Resolver", "Tunnel", "Transport", "Proxy", "Egress", "RemoteNode", "Region", "Destination", "Service", "Endpoint", "ApplicationPath"];
export type FabricResourceKind = (typeof FABRIC_RESOURCE_KINDS)[number];
export declare const FABRIC_RESOURCE_STATES: readonly ["UNKNOWN", "DISCOVERING", "HEALTHY", "DEGRADED", "FAILED", "BLOCKED", "RESTRICTED", "RECOVERING", "QUARANTINED", "DRAINING", "UNAVAILABLE"];
export type FabricResourceState = (typeof FABRIC_RESOURCE_STATES)[number];
export type FabricLifecycle = 'discovered' | 'active' | 'draining' | 'retired';
export interface FabricCapability {
    readonly id: string;
    readonly scope: string;
    readonly authority: 'runtime' | 'adapter' | 'provider' | 'external';
    readonly trust: number;
    readonly safety: 'read-only' | 'safe' | 'governed';
    readonly platforms: readonly string[];
}
export interface FabricHealth {
    readonly status: 'healthy' | 'degraded' | 'failed' | 'unknown';
    readonly score: number;
    readonly checkedAt: string;
}
export interface FabricResource {
    readonly id: string;
    readonly kind: FabricResourceKind;
    readonly state: FabricResourceState;
    readonly health: FabricHealth;
    readonly confidence: number;
    readonly observedAt: string;
    readonly expiresAt?: string;
    readonly trust: number;
    readonly capacity: Readonly<Record<string, number>>;
    readonly cost: Readonly<Record<string, number>>;
    readonly owner: string;
    readonly failureDomains: readonly string[];
    readonly lifecycle: FabricLifecycle;
    readonly capabilities: readonly FabricCapability[];
    readonly metadata: Readonly<Record<string, unknown>>;
}
export interface FabricEdge {
    readonly from: string;
    readonly to: string;
    readonly relation: string;
}
export interface FabricSnapshot {
    readonly version: number;
    readonly discoveredAt: string;
    readonly resources: readonly FabricResource[];
    readonly edges: readonly FabricEdge[];
}
export interface FabricDiscoveryContext {
    readonly signal: AbortSignal;
    readonly limit: number;
    readonly now: string;
    readonly since?: string;
}
export interface FabricDiscoveryProvider {
    readonly id: string;
    readonly owner: string;
    discover(context: FabricDiscoveryContext): Promise<readonly FabricResource[]>;
}
export interface FabricSelectionRequest {
    readonly kind?: FabricResourceKind;
    readonly requiredCapabilities?: readonly string[];
    readonly preferredFailureDomains?: readonly string[];
    readonly minimumTrust?: number;
    readonly maximumCost?: number;
    readonly now?: string;
    readonly platform?: FabricPlatform;
    readonly maximumSafety?: FabricCapability['safety'];
    readonly requireRuntimeAuthority?: boolean;
    readonly minimumDiverseAlternatives?: number;
    readonly maxAgeMs?: number;
    /**
     * Optional compiled intent consumed as read-only selection evidence. This is
     * deliberately not an admission or mutation path: governance and the
     * closed-loop runtime remain responsible for authorizing any route change.
     */
    readonly intent?: Pick<CompiledIntent, 'intentId' | 'target' | 'constraints' | 'objectives'>;
}
export interface RoutingSelectionAudit {
    readonly intentId?: string;
    readonly applicationAffinity?: string;
    readonly criteria: readonly string[];
    readonly selectedId?: string;
    readonly candidateIds: readonly string[];
    readonly rejected: readonly {
        id: string;
        reason: string;
    }[];
    readonly evaluatedAt: string;
}
export interface FabricSelectionResult {
    readonly selected: FabricResource | undefined;
    readonly candidates: readonly FabricResource[];
    readonly rejected: readonly {
        id: string;
        reason: string;
    }[];
    readonly reason: string;
    readonly diversity?: DiverseSelection;
    readonly freshness?: readonly FreshnessReport[];
    readonly capabilityDecisions?: readonly CapabilityDecision[];
    /** Deterministic, read-only evidence explaining the fabric selection. */
    readonly audit: RoutingSelectionAudit;
}
interface IntentRoutingPreferences {
    readonly application?: string;
    readonly maximumCost?: number;
    readonly minimumTrust?: number;
    readonly preferredFailureDomains: readonly string[];
    readonly requiredCapabilities: readonly string[];
    readonly invalidReason?: string;
}
/**
 * Compiles the deliberately small Phase 93 routing vocabulary from a compiled
 * intent. Unknown constraints are not interpreted as routing authority.
 */
export declare const deriveIntentRoutingPreferences: (intent: FabricSelectionRequest["intent"]) => IntentRoutingPreferences;
export declare class ProgrammableConnectivityFabric {
    readonly capabilityAuthority: FabricCapabilityAuthority;
    private readonly providers;
    private snapshot;
    registerProvider(provider: FabricDiscoveryProvider): void;
    providersList(): readonly FabricDiscoveryProvider[];
    snapshotState(): FabricSnapshot;
    ownershipIndex(): Readonly<Record<string, string>>;
    resourcesOwnedBy(owner: string): readonly FabricResource[];
    freshnessReport(now?: string): readonly FreshnessReport[];
    pruneExpired(now?: string): FabricSnapshot;
    discover(options?: {
        signal?: AbortSignal;
        limit?: number | undefined;
        since?: string;
    }): Promise<FabricSnapshot>;
    private registerProviderCapabilities;
    select(request?: FabricSelectionRequest): FabricSelectionResult;
    reconcileRoutingGraph(graph: NetworkPathGraph): FabricSnapshot;
}
export {};
//# sourceMappingURL=fabric.d.ts.map