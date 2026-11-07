/**
 * Phase 104 — Historical Network State & Time-Series Intelligence.
 *
 * A bounded, tiered, in-memory time-series store with deterministic bucketed
 * rollups. Raw points age into coarser buckets by retention tier. Durable
 * persistence stays with the existing persistence boundary; this store is the
 * query and rollup model that both feed.
 */
export interface SeriesPoint {
    readonly atMs: number;
    readonly value: number;
}
export interface RetentionTier {
    /** Bucket width in ms; 0 means raw points. */
    readonly resolutionMs: number;
    readonly retentionMs: number;
}
export declare const DEFAULT_RETENTION_TIERS: readonly RetentionTier[];
export interface RollupBucket {
    readonly startMs: number;
    readonly endMs: number;
    readonly count: number;
    readonly min: number;
    readonly max: number;
    readonly mean: number;
    readonly p95: number;
}
export interface SeriesQuery {
    readonly fromMs: number;
    readonly toMs: number;
    readonly resolutionMs?: number;
}
export declare class TimeSeriesStore {
    private readonly maxPointsPerSeries;
    private readonly series;
    private readonly tiers;
    constructor(tiers?: readonly RetentionTier[], maxPointsPerSeries?: number);
    record(seriesId: string, at: string | number, value: number): void;
    seriesIds(): readonly string[];
    /** Drops points older than the longest tier; returns the number removed. */
    expire(nowMs: number): number;
    /** Finest tier whose retention still covers `nowMs - fromMs`, no finer than requested. */
    resolutionFor(fromMs: number, nowMs: number, requested?: number): number;
    raw(seriesId: string, fromMs: number, toMs: number): readonly SeriesPoint[];
    query(seriesId: string, q: SeriesQuery): readonly RollupBucket[];
    /** Compares two windows of the same series (e.g. now vs baseline). */
    compareWindows(seriesId: string, current: SeriesQuery, baseline: SeriesQuery): {
        readonly currentMean?: number;
        readonly baselineMean?: number;
        readonly relativeChange?: number;
    };
}
//# sourceMappingURL=time-series.d.ts.map