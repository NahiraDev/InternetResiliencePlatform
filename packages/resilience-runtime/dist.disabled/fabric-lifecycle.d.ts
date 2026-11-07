/**
 * Canonical fabric resource state machine, freshness and failure-domain
 * diversity (issue #275, tasks 2/3/7).
 *
 * The 11 canonical states already exist in `fabric.ts`; this module makes the
 * legal transitions explicit so a resource cannot silently jump from FAILED to
 * HEALTHY (it must pass through RECOVERING), and provides the diversity maths
 * that `select()` previously approximated with a boolean "has a preferred
 * failure domain" check.
 */
import type { FabricResource, FabricResourceState } from './fabric.js';
/**
 * Legal target states per current state.
 * - Terminal-ish states (UNAVAILABLE, QUARANTINED) require explicit recovery.
 * - FAILED/BLOCKED/RESTRICTED must pass through RECOVERING before HEALTHY.
 * - DRAINING must pass through UNAVAILABLE or RECOVERING before reuse.
 */
export declare const FABRIC_STATE_TRANSITIONS: Readonly<Record<FabricResourceState, readonly FabricResourceState[]>>;
export declare const isLegalFabricTransition: (from: FabricResourceState, to: FabricResourceState) => boolean;
export declare class IllegalFabricStateTransitionError extends Error {
    readonly from: FabricResourceState;
    readonly to: FabricResourceState;
    readonly code = "ILLEGAL_FABRIC_STATE_TRANSITION";
    constructor(from: FabricResourceState, to: FabricResourceState);
}
export declare const assertFabricStateTransition: (from: FabricResourceState, to: FabricResourceState) => void;
/**
 * States from which a resource may serve selection.
 *
 * RECOVERING and RESTRICTED are deliberately excluded. A resource that is still
 * recovering has not re-established its outcome, and a policy-restricted
 * resource is not permitted to carry traffic; selecting either would let an
 * unverified or disallowed path reach the data plane.
 */
export declare const SELECTABLE_FABRIC_STATES: ReadonlySet<FabricResourceState>;
export interface FreshnessReport {
    readonly resourceId: string;
    readonly fresh: boolean;
    readonly ageMs: number;
    readonly expiresAt?: string;
    readonly expiredForMs?: number;
}
/** Default freshness ceiling for observations without an explicit expiry. */
export declare const DEFAULT_FABRIC_MAX_AGE_MS: number;
/** Freshness is evaluated per resource against an explicit clock. */
export declare const evaluateFabricFreshness: (resource: FabricResource, nowIso: string, maxAgeMs?: number) => FreshnessReport;
export declare const partitionByFreshness: (resources: readonly FabricResource[], nowIso: string) => {
    readonly fresh: readonly FabricResource[];
    readonly stale: readonly FabricResource[];
};
/**
 * True failure-domain diversity.
 *
 * Two candidates are only diverse when they share **no** failure domain.
 * `select()` previously scored "has at least one preferred domain", which
 * cannot distinguish genuinely independent paths from two paths through the
 * same upstream carrier.
 */
export declare const sharesFailureDomain: (a: FabricResource, b: FabricResource) => boolean;
export interface DiverseSelection {
    readonly selected: FabricResource | undefined;
    /** Ordered candidates; each entry is disjoint from all previously chosen ones. */
    readonly diverse: readonly FabricResource[];
    readonly fallback: readonly FabricResource[];
    /** Distinct failure domains spanned by the diverse selection. */
    readonly distinctFailureDomains: number;
    readonly reason: string;
}
/** Count of distinct failure domains spanned by a candidate set. */
export declare const countDistinctFailureDomains: (resources: readonly FabricResource[]) => number;
/**
 * Greedy maximal-disjoint selection: repeatedly take the highest ranked
 * candidate that shares no failure domain with anything already chosen.
 */
export declare const selectDiverseResources: (ranked: readonly FabricResource[], options?: {
    readonly required?: number;
}) => DiverseSelection;
//# sourceMappingURL=fabric-lifecycle.d.ts.map