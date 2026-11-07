/**
 * Strategy outcome estimation and alternate selection for issue #279
 * (issue #272 Section H, tasks 5 and 8).
 *
 * Task 8: maintain per-strategy success/failure estimates that decay, so a
 * strategy's worth reflects recent verified evidence rather than all history.
 *
 * Task 5: when a strategy fails, select an *alternate* rather than retrying.
 * Selection is bounded and explainable, and a quarantined strategy is never
 * returned while an eligible alternative exists.
 */
import type { FailureLayer } from './adaptive-control.js';
export interface StrategyCandidate {
    readonly id: string;
    readonly intent: string;
    /** Optional layer this strategy operates on. */
    readonly targetLayer?: FailureLayer;
    readonly quarantineKey?: string;
    readonly alreadyFailed?: boolean;
}
export interface StrategyEstimate {
    readonly strategyId: string;
    /** Beta(α, β) parameters over verified outcomes. */
    readonly alpha: number;
    readonly beta: number;
    /** Mean of the beta distribution in [0,1]. */
    readonly successRate: number;
    readonly verifiedOutcomes: number;
    readonly lastUpdatedAt: string;
    /** True when the estimate has too little evidence to trust. */
    readonly lowConfidence: boolean;
}
export interface StrategyEstimatorOptions {
    /** Half-life for outcome weight in ms. Older outcomes fade. */
    readonly halfLifeMs?: number;
    readonly nowMs?: () => number;
}
/**
 * Decaying success/failure estimator per strategy.
 *
 * Implements decayed weighted Beta estimation: rather than forgetting old
 * outcomes entirely, each outcome's weight decays by half per half-life. This
 * keeps the estimate responsive to recent reality without discarding history
 * outright.
 */
export declare class StrategyOutcomeEstimator {
    private readonly outcomes;
    private readonly halfLifeMs;
    private readonly now;
    constructor(options?: StrategyEstimatorOptions);
    /** Records a verified outcome. Unverified outcomes must not be recorded. */
    record(strategyId: string, success: boolean, atMs?: number): StrategyEstimate;
    estimate(strategyId: string): StrategyEstimate;
    /** Drops outcomes older than `retentionMs`. Compaction is explicit. */
    prune(retentionMs: number, nowMs?: number): number;
    /** Total decayed evidence, used to bound the estimator's memory. */
    size(): number;
}
export interface AlternateSelection {
    readonly selected?: StrategyCandidate;
    readonly rejected: readonly {
        readonly id: string;
        readonly reason: 'already-failed' | 'quarantined' | 'lower-estimate' | 'no-alternate-available';
    }[];
    readonly rationale: string;
}
/**
 * Selects an alternate strategy after a failure.
 *
 * Order of preference:
 *  1. never the strategy that just failed (blind retry is excluded);
 *  2. never a quarantined strategy while an eligible one exists;
 *  3. among the rest, highest decayed success estimate.
 *
 * Returns `selected: undefined` when nothing eligible remains, which is the
 * honest answer: the runtime should stop acting rather than pick the least-bad
 * failing option.
 */
export declare const selectAlternateStrategy: (input: {
    readonly failed: StrategyCandidate;
    readonly candidates: readonly StrategyCandidate[];
    readonly estimator?: StrategyOutcomeEstimator;
    readonly quarantined?: ReadonlySet<string>;
    /** Layer to move up to when the failed layer is exhausted. */
    readonly preferredLayer?: FailureLayer;
}) => AlternateSelection;
//# sourceMappingURL=strategy-outcome.d.ts.map