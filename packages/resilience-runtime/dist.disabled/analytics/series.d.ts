/**
 * Pure numeric helpers shared by the post-93 phases. No clocks, no I/O and no
 * randomness: every function is deterministic for identical inputs.
 */
export declare const clamp: (value: number, min: number, max: number) => number;
export declare const finiteOr: (value: number, fallback: number) => number;
/** Exponentially weighted moving average over an ordered series. */
export declare const ewma: (values: readonly number[], alpha: number) => number | undefined;
export declare const mean: (values: readonly number[]) => number | undefined;
export declare const stddev: (values: readonly number[]) => number | undefined;
export declare const median: (values: readonly number[]) => number | undefined;
export declare const percentile: (values: readonly number[], p: number) => number | undefined;
export interface TimedSample {
    readonly at: number;
    readonly value: number;
}
export interface LinearTrend {
    readonly slopePerMs: number;
    readonly intercept: number;
    readonly rSquared: number;
    readonly samples: number;
}
/** Ordinary least squares over (time, value). Needs at least two distinct times. */
export declare const linearTrend: (samples: readonly TimedSample[]) => LinearTrend | undefined;
/** Bounded ring buffer of timed samples with deterministic eviction. */
export declare class SampleWindow {
    readonly capacity: number;
    readonly maxAgeMs: number;
    private readonly items;
    constructor(capacity: number, maxAgeMs?: number);
    push(sample: TimedSample): void;
    prune(now: number): void;
    values(): readonly TimedSample[];
    get size(): number;
    latest(): TimedSample | undefined;
}
export declare const parseTime: (iso: string) => number;
//# sourceMappingURL=series.d.ts.map