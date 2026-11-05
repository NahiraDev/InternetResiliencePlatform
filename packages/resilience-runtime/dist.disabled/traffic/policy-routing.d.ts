/**
 * Phase 95 — Policy-Based Routing.
 *
 * Declarative routing policies map traffic classifications onto the existing
 * `FabricSelectionRequest` constraint vocabulary. Policies only narrow or order
 * fabric selection; they cannot select a resource directly and cannot mutate.
 * Invalid or conflicting policy sets fail closed.
 */
import type { FabricCapability, FabricResourceKind, FabricSelectionRequest } from '../fabric.js';
import type { ProgrammableConnectivityFabric, FabricSelectionResult } from '../fabric.js';
import type { TrafficClass, TrafficClassification } from './classification.js';
export interface RoutingPolicyRule {
    readonly id: string;
    readonly priority: number;
    readonly description?: string;
    readonly match: {
        readonly trafficClasses?: readonly TrafficClass[];
        readonly applications?: readonly string[];
        readonly tenants?: readonly string[];
        /** Inclusive UTC hour window [startHour, endHour); may wrap midnight. */
        readonly utcHours?: readonly [number, number];
    };
    readonly action: 'route' | 'deny';
    readonly constraints?: {
        readonly kind?: FabricResourceKind;
        readonly minimumTrust?: number;
        readonly maximumCost?: number;
        readonly requiredCapabilities?: readonly string[];
        readonly preferredFailureDomains?: readonly string[];
        readonly minimumDiverseAlternatives?: number;
        readonly maximumSafety?: FabricCapability['safety'];
        readonly maxAgeMs?: number;
    };
}
export interface RoutingPolicyContext {
    readonly classification: TrafficClassification;
    readonly tenant?: string;
    readonly now: string;
}
export interface RoutingPolicyDecision {
    readonly outcome: 'route' | 'deny' | 'no-policy';
    readonly ruleId?: string;
    readonly request?: FabricSelectionRequest;
    readonly reasons: readonly string[];
}
export declare class RoutingPolicyValidationError extends Error {
    readonly violations: readonly string[];
    constructor(violations: readonly string[]);
}
export declare const validateRoutingPolicies: (rules: readonly RoutingPolicyRule[]) => readonly RoutingPolicyRule[];
/** Resolves the first matching policy into a fabric selection request. */
export declare const resolveRoutingPolicy: (rules: readonly RoutingPolicyRule[], ctx: RoutingPolicyContext) => RoutingPolicyDecision;
export interface PolicyRoutedSelection {
    readonly decision: RoutingPolicyDecision;
    readonly selection?: FabricSelectionResult;
    readonly allowed: boolean;
}
/**
 * Applies a policy then delegates to the one fabric selection boundary. A deny
 * decision or an invalid policy set never reaches `fabric.select`.
 */
export declare const selectWithRoutingPolicy: (fabric: Pick<ProgrammableConnectivityFabric, "select">, rules: readonly RoutingPolicyRule[], ctx: RoutingPolicyContext, base?: FabricSelectionRequest) => PolicyRoutedSelection;
//# sourceMappingURL=policy-routing.d.ts.map