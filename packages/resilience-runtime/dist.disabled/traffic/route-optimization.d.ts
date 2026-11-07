/**
 * Phase 96 — Dynamic Route Optimization.
 *
 * Advisory, bounded re-optimization on top of the fabric selection boundary.
 * It compares the currently active route against the best fresh candidate and
 * recommends a switch only when the improvement clears a hysteresis margin, the
 * dwell time has elapsed and the flap budget is not exhausted. The output is a
 * `CandidateAction` for the canonical planning/closed-loop path; this module
 * never executes a change.
 */
import type { CandidateAction } from '../domain/types.js';
import type { FabricResource, FabricSelectionRequest, FabricSelectionResult, ProgrammableConnectivityFabric } from '../fabric.js';
export interface RouteOptimizationConfig {
    /** Minimum relative score improvement (0..1) required to recommend a switch. */
    readonly improvementMargin: number;
    /** Minimum time the current route must have been active before switching. */
    readonly minDwellMs: number;
    /** Maximum recommended switches per window. */
    readonly maxSwitchesPerWindow: number;
    readonly windowMs: number;
}
export declare const DEFAULT_ROUTE_OPTIMIZATION_CONFIG: RouteOptimizationConfig;
export type RouteOptimizationVerdict = 'keep' | 'switch' | 'hold' | 'unavailable';
export interface RouteOptimizationRecommendation {
    readonly verdict: RouteOptimizationVerdict;
    readonly currentId?: string;
    readonly proposedId?: string;
    readonly currentScore?: number;
    readonly proposedScore?: number;
    readonly improvement: number;
    readonly reasons: readonly string[];
    readonly selection: FabricSelectionResult;
    readonly evaluatedAt: string;
}
/** Route score in [0,100]; mirrors the fabric ranking inputs without redefining selection. */
export declare const routeScore: (r: FabricResource) => number;
export interface ActiveRoute {
    readonly resourceId: string;
    readonly activeSince: string;
}
export declare class RouteOptimizationAdvisor {
    private readonly fabric;
    private readonly config;
    private readonly switches;
    constructor(fabric: Pick<ProgrammableConnectivityFabric, 'select' | 'snapshotState'>, config?: RouteOptimizationConfig);
    /** Records that a recommended switch was actually applied by the runtime. */
    recordApplied(at: string): void;
    private recentSwitches;
    evaluate(active: ActiveRoute, request: FabricSelectionRequest, now: string): RouteOptimizationRecommendation;
}
/** Converts a `switch` recommendation into a planner-visible candidate; other verdicts yield nothing. */
export declare const toRouteChangeCandidate: (rec: RouteOptimizationRecommendation, correlationId?: string) => CandidateAction | undefined;
//# sourceMappingURL=route-optimization.d.ts.map