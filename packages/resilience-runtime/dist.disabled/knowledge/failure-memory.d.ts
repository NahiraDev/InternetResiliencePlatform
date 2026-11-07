/**
 * Decaying failure memory and strategy quarantine for issue #276 (task 8).
 *
 * Failure memory records which strategies failed for which destination and
 * how recently. Confidence decays exponentially with a configurable half-life so
 * an old failure does not suppress a strategy forever.
 *
 * Quarantine is advisory ranking input only. A quarantined strategy is heavily
 * penalised in ranking, never forbidden by this module: policy remains the only
 * authority that may deny an action.
 */
export interface FailureEvent {
    readonly strategyId: string;
    readonly destination?: string;
    readonly providerId?: string;
    readonly observedAt?: string;
    /** Severity of the failure in [0,1]. */
    readonly severity?: number;
}
export interface FailureMemoryOptions {
    /** Half-life for failure decay in ms. Defaults to 24h. */
    readonly halfLifeMs?: number;
    /** Penalty multiplier applied to a quarantined candidate's score. */
    readonly quarantinePenalty?: number;
    /** Decayed failure weight at which a strategy is quarantined. */
    readonly quarantineThreshold?: number;
    /** A failure older than this is discarded entirely. */
    readonly retentionMs?: number;
}
export interface StrategyQuarantine {
    readonly strategyId: string;
    readonly decayedFailureWeight: number;
    readonly failureCount: number;
    readonly lastFailureAt: string;
    readonly quarantined: boolean;
}
export interface FailureMemorySnapshot {
    readonly strategies: readonly StrategyQuarantine[];
    readonly now: string;
}
/**
 * In-memory, decaying failure memory keyed by strategy and destination scope.
 */
export declare class DecayingFailureMemory {
    private readonly events;
    private readonly halfLifeMs;
    private readonly quarantinePenalty;
    private readonly quarantineThreshold;
    private readonly retentionMs;
    constructor(options?: FailureMemoryOptions);
    recordFailure(event: FailureEvent): void;
    private key;
    /** Decayed weight of a strategy's failures, per severity, at `nowMs`. */
    private weightFor;
    /** Quarantine state for one strategy, optionally within a destination scope. */
    quarantineFor(strategyId: string, scope?: {
        destination?: string;
        providerId?: string;
    }, nowMs?: number): StrategyQuarantine;
    /** Score multiplier for a strategy; 1 means unaffected, <1 penalised. */
    scoreMultiplier(strategyId: string, scope?: {
        destination?: string;
        providerId?: string;
    }, nowMs?: number): number;
    /** Strategies currently quarantined, for explainability. */
    quarantined(scope?: {
        destination?: string;
        providerId?: string;
    }, nowMs?: number): readonly StrategyQuarantine[];
    /** Removes failures that have decayed past retention. */
    prune(nowMs?: number): number;
    clear(): void;
    snapshot(nowMs?: number): FailureMemorySnapshot;
}
//# sourceMappingURL=failure-memory.d.ts.map