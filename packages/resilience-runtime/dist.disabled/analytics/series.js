/**
 * Pure numeric helpers shared by the post-93 phases. No clocks, no I/O and no
 * randomness: every function is deterministic for identical inputs.
 */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const finiteOr = (value, fallback) => Number.isFinite(value) ? value : fallback;
/** Exponentially weighted moving average over an ordered series. */
export const ewma = (values, alpha) => {
    if (values.length === 0)
        return undefined;
    const a = clamp(alpha, 0.0001, 1);
    let current = values[0];
    for (let i = 1; i < values.length; i += 1)
        current = a * values[i] + (1 - a) * current;
    return current;
};
export const mean = (values) => values.length === 0 ? undefined : values.reduce((sum, v) => sum + v, 0) / values.length;
export const stddev = (values) => {
    const m = mean(values);
    if (m === undefined)
        return undefined;
    return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length);
};
export const median = (values) => {
    if (values.length === 0)
        return undefined;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
export const percentile = (values, p) => {
    if (values.length === 0)
        return undefined;
    const sorted = [...values].sort((a, b) => a - b);
    const rank = clamp(p, 0, 100) / 100 * (sorted.length - 1);
    const lo = Math.floor(rank);
    const hi = Math.ceil(rank);
    const loV = sorted[lo];
    const hiV = sorted[hi];
    return loV + (hiV - loV) * (rank - lo);
};
/** Ordinary least squares over (time, value). Needs at least two distinct times. */
export const linearTrend = (samples) => {
    if (samples.length < 2)
        return undefined;
    const t0 = samples[0]?.at ?? 0;
    const xs = samples.map((s) => s.at - t0);
    const ys = samples.map((s) => s.value);
    const mx = mean(xs);
    const my = mean(ys);
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (let i = 0; i < xs.length; i += 1) {
        const dx = xs[i] - mx;
        const dy = ys[i] - my;
        sxx += dx * dx;
        sxy += dx * dy;
        syy += dy * dy;
    }
    if (sxx === 0)
        return undefined;
    const slope = sxy / sxx;
    const rSquared = syy === 0 ? 1 : clamp((sxy * sxy) / (sxx * syy), 0, 1);
    return Object.freeze({ slopePerMs: slope, intercept: my - slope * mx, rSquared, samples: samples.length });
};
/** Bounded ring buffer of timed samples with deterministic eviction. */
export class SampleWindow {
    capacity;
    maxAgeMs;
    items = [];
    constructor(capacity, maxAgeMs = Number.POSITIVE_INFINITY) {
        this.capacity = capacity;
        this.maxAgeMs = maxAgeMs;
        if (!Number.isInteger(capacity) || capacity < 1)
            throw new Error('sample window capacity must be a positive integer');
    }
    push(sample) {
        if (!Number.isFinite(sample.at) || !Number.isFinite(sample.value))
            return;
        this.items.push(sample);
        this.items.sort((a, b) => a.at - b.at);
        while (this.items.length > this.capacity)
            this.items.shift();
    }
    prune(now) {
        while (this.items.length > 0 && now - this.items[0].at > this.maxAgeMs)
            this.items.shift();
    }
    values() { return Object.freeze([...this.items]); }
    get size() { return this.items.length; }
    latest() { return this.items[this.items.length - 1]; }
}
export const parseTime = (iso) => {
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : Number.NaN;
};
//# sourceMappingURL=series.js.map