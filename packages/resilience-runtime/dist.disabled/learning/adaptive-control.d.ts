/**
 * Failure classification and adaptive control intensity for issue #279
 * (issue #272 Section H, tasks 3 and 4).
 *
 * Task 4: classify a failure by the layer that actually failed and by failure
 * domain, so the runtime can distinguish "this path broke" from "this whole
 * provider is down". Retrying blindly wastes mutation budget and can deepen the
 * incident.
 *
 * Task 3: control intensity adapts to observed outcomes. After repeated
 * failures the runtime must reduce how aggressively it acts, and it must relax
 * again only with evidence.
 */
import type { HealthReport, ScopedHealthSignal, HealthScope } from '../verification/outcome-verification.js';
export declare const FAILURE_LAYERS: readonly ["application", "service", "destination", "transport", "path", "resource", "provider", "region", "unknown"];
export type FailureLayer = (typeof FAILURE_LAYERS)[number];
export interface FailureClassification {
    readonly failedLayer: FailureLayer;
    /** Scope at which health is worst; the narrowest true description. */
    readonly widestAffectedScope: HealthScope | 'none';
    readonly failureDomain?: string;
    /** Scopes confirmed healthy, which bounds what the failure can be. */
    readonly healthyScopes: readonly HealthScope[];
    /** True when several scopes in one domain failed together. */
    readonly correlated: boolean;
    /** Suggested next layer to try, if any. */
    readonly alternativeHint?: FailureLayer;
    readonly rationale: string;
}
/**
 * Classifies a failure from scoped health. The outermost failing scope bounds
 * the incident: if `transport` is failed then `destination` being failed is a
 * consequence, not an independent fault, and a strategy targeting the
 * destination alone would be a blind retry.
 */
export declare const classifyFailureLayer: (health: HealthReport, options?: {
    readonly failureDomain?: string;
    readonly signals?: readonly ScopedHealthSignal[];
}) => FailureClassification;
export declare const CONTROL_INTENSITIES: readonly ["observe", "probe", "degraded", "autonomous"];
export type ControlIntensity = (typeof CONTROL_INTENSITIES)[number];
export interface AdaptiveIntensityState {
    readonly intensity: ControlIntensity;
    /** Consecutive verified-successful outcomes. */
    readonly consecutiveSuccesses: number;
    /** Consecutive verified-failures. */
    readonly consecutiveFailures: number;
    /** Consecutive escalations toward autonomous. */
    readonly promotions: number;
    readonly rationale: string;
}
export interface AdaptiveIntensityOptions {
    /** Successes required to promote one level. */
    readonly promoteAfter?: number;
    /** Failures required to demote one level. */
    readonly demoteAfter?: number;
    /** Hard cap: learning may never reach the top intensity on its own. */
    readonly ceiling?: ControlIntensity;
    readonly start?: ControlIntensity;
}
/**
 * Adaptive control intensity.
 *
 * Demotion is faster than promotion (default 2 failures vs 3 successes) because
 * an unverified action during an incident is worse than a slow one. Promotion
 * requires verified evidence, and the ceiling means learning can never grant
 * itself the highest intensity — that requires explicit operator policy.
 */
export declare class AdaptiveControlIntensity {
    private level;
    private successes;
    private failures;
    private promotions;
    private readonly promoteAfter;
    private readonly demoteAfter;
    private readonly ceiling;
    private readonly start;
    constructor(options?: AdaptiveIntensityOptions);
    private get ceilingIndex();
    /** Records a *verified* successful outcome. Return codes are not evidence. */
    recordSuccess(): AdaptiveIntensityState;
    /** Records a verified failure or an unverified outcome. */
    recordFailure(): AdaptiveIntensityState;
    reset(): AdaptiveIntensityState;
    private state;
    snapshot(): AdaptiveIntensityState;
}
//# sourceMappingURL=adaptive-control.d.ts.map