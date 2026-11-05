/**
 * Phase 99 — Predictive Failover & Recovery.
 *
 * Trend-based, advisory-only prediction. A degrading resource produces a
 * `FailoverAdvisory` naming a pre-armed standby chosen through the existing
 * fabric selection boundary; recovery readiness gates fail-back with dwell and
 * consecutive-healthy requirements. Nothing here executes a switch: advisories
 * flow to the closed-loop controller and obey autonomy/safety gates.
 */
import type { FabricResource, FabricSelectionRequest, FabricSelectionResult, ProgrammableConnectivityFabric } from '../fabric.js';
export interface PredictiveFailoverConfig {
    readonly windowSize: number;
    readonly minSamples: number;
    /** Health score at which the resource is considered failed. */
    readonly failureThreshold: number;
    /** Advise when predicted breach is within this horizon. */
    readonly horizonMs: number;
    readonly minRSquared: number;
    /** Recovery: consecutive healthy samples needed and minimum healthy dwell. */
    readonly recoveryHealthyScore: number;
    readonly recoveryConsecutive: number;
    readonly recoveryDwellMs: number;
}
export declare const DEFAULT_PREDICTIVE_FAILOVER_CONFIG: PredictiveFailoverConfig;
export interface HealthSample {
    readonly resourceId: string;
    readonly at: string;
    readonly score: number;
}
export type FailoverUrgency = 'none' | 'watch' | 'prepare' | 'imminent';
export interface FailoverAdvisory {
    readonly resourceId: string;
    readonly urgency: FailoverUrgency;
    readonly predictedBreachInMs?: number;
    readonly currentScore?: number;
    readonly slopePerMinute?: number;
    readonly confidence: number;
    readonly standby?: FabricResource;
    readonly standbySelection?: FabricSelectionResult;
    readonly reasons: readonly string[];
    readonly evaluatedAt: string;
}
export interface RecoveryReadiness {
    readonly resourceId: string;
    readonly ready: boolean;
    readonly consecutiveHealthy: number;
    readonly healthyForMs: number;
    readonly reasons: readonly string[];
}
export declare class PredictiveFailoverAdvisor {
    private readonly fabric;
    private readonly config;
    private readonly windows;
    constructor(fabric: Pick<ProgrammableConnectivityFabric, 'select'>, config?: PredictiveFailoverConfig);
    observe(sample: HealthSample): void;
    advise(resourceId: string, standbyRequest: FabricSelectionRequest, now: string): FailoverAdvisory;
    private withStandby;
    recoveryReadiness(resourceId: string, now: string): RecoveryReadiness;
}
//# sourceMappingURL=predictive-failover.d.ts.map