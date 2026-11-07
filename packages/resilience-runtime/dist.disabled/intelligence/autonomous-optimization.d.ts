/**
 * Phase 124 — Autonomous Optimization.
 *
 * Bounded, reversible tuning of declared runtime parameters (thresholds,
 * hysteresis margins, timeouts). Each parameter has hard limits and a maximum
 * step; at most one parameter is under trial at a time; a trial is measured
 * against the baseline objective and reverted automatically if it regresses.
 * Proposals are gated by the active intent's autonomy level, and every change
 * is recorded for audit. It tunes parameters only; it never selects actions.
 */
export type AutonomyLevel = 'OBSERVE_ONLY' | 'ADVISORY' | 'SAFE_AUTOMATION' | 'AUTONOMOUS' | 'HIGH_RISK_REQUIRES_APPROVAL';
export interface TunableParameter {
    readonly name: string;
    readonly value: number;
    readonly min: number;
    readonly max: number;
    readonly maxStep: number;
    /** Direction that increases the objective when moved; used only to seed the first probe. */
    readonly higherIsBetter?: boolean;
}
export interface TuningTrial {
    readonly parameter: string;
    readonly from: number;
    readonly to: number;
    readonly baseline: number;
    readonly startedAtMs: number;
}
export interface TuningRecord {
    readonly parameter: string;
    readonly from: number;
    readonly to: number;
    readonly decision: 'proposed' | 'applied' | 'committed' | 'reverted' | 'rejected';
    readonly reason: string;
    readonly atMs: number;
}
export interface OptimizerOptions {
    readonly cooldownMs?: number;
    readonly trialDurationMs?: number;
    /** Fractional objective regression (e.g. 0.02) that triggers revert. */
    readonly regressionTolerance?: number;
    /** Minimum improvement to commit a trial. */
    readonly improvementThreshold?: number;
    readonly maxChangesPerDay?: number;
}
export declare class BoundedParameterOptimizer {
    private readonly params;
    private trial;
    private readonly log;
    private readonly lastChange;
    private readonly changeTimes;
    private readonly o;
    constructor(parameters: readonly TunableParameter[], options?: OptimizerOptions);
    current(name: string): number | undefined;
    values(): Readonly<Record<string, number>>;
    activeTrial(): TuningTrial | undefined;
    history(): readonly TuningRecord[];
    private record;
    /** Starts a trial moving `parameter` toward `target` by at most `maxStep`. Returns the trial or the rejection reason. */
    propose(parameter: string, target: number, baselineObjective: number, autonomy: AutonomyLevel, nowMs: number): {
        readonly started: boolean;
        readonly trial?: TuningTrial;
        readonly reason: string;
    };
    /** Feeds the current objective. Reverts early on regression, commits after the trial window if not worse. */
    evaluate(objective: number, nowMs: number): {
        readonly outcome: 'no-trial' | 'running' | 'reverted' | 'committed';
        readonly reason: string;
    };
    /** Emergency stop: restores the pre-trial value immediately. */
    abort(nowMs: number): boolean;
}
//# sourceMappingURL=autonomous-optimization.d.ts.map