/**
 * Pure numeric helpers shared by the post-93 phases. No clocks, no I/O and no
 * randomness: every function is deterministic for identical inputs.
 */

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

/** Exponentially weighted moving average over an ordered series. */
export const ewma = (values: readonly number[], alpha: number): number | undefined => {
  if (values.length === 0) return undefined;
  const a = clamp(alpha, 0.0001, 1);
  let current = values[0] as number;
  for (let i = 1; i < values.length; i += 1) current = a * (values[i] as number) + (1 - a) * current;
  return current;
};

export const mean = (values: readonly number[]): number | undefined =>
  values.length === 0 ? undefined : values.reduce((sum, v) => sum + v, 0) / values.length;

export const stddev = (values: readonly number[]): number | undefined => {
  const m = mean(values);
  if (m === undefined) return undefined;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length);
};

export const median = (values: readonly number[]): number | undefined => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
};

export const percentile = (values: readonly number[], p: number): number | undefined => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = clamp(p, 0, 100) / 100 * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const loV = sorted[lo] as number;
  const hiV = sorted[hi] as number;
  return loV + (hiV - loV) * (rank - lo);
};

export interface TimedSample { readonly at: number; readonly value: number }

export interface LinearTrend {
  readonly slopePerMs: number;
  readonly intercept: number;
  readonly rSquared: number;
  readonly samples: number;
}

/** Ordinary least squares over (time, value). Needs at least two distinct times. */
export const linearTrend = (samples: readonly TimedSample[]): LinearTrend | undefined => {
  if (samples.length < 2) return undefined;
  const t0 = samples[0]?.at ?? 0;
  const xs = samples.map((s) => s.at - t0);
  const ys = samples.map((s) => s.value);
  const mx = mean(xs) as number;
  const my = mean(ys) as number;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const dx = (xs[i] as number) - mx;
    const dy = (ys[i] as number) - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return undefined;
  const slope = sxy / sxx;
  const rSquared = syy === 0 ? 1 : clamp((sxy * sxy) / (sxx * syy), 0, 1);
  return Object.freeze({ slopePerMs: slope, intercept: my - slope * mx, rSquared, samples: samples.length });
};

/** Bounded ring buffer of timed samples with deterministic eviction. */
export class SampleWindow {
  private readonly items: TimedSample[] = [];
  constructor(readonly capacity: number, readonly maxAgeMs: number = Number.POSITIVE_INFINITY) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('sample window capacity must be a positive integer');
  }
  push(sample: TimedSample): void {
    if (!Number.isFinite(sample.at) || !Number.isFinite(sample.value)) return;
    this.items.push(sample);
    this.items.sort((a, b) => a.at - b.at);
    while (this.items.length > this.capacity) this.items.shift();
  }
  prune(now: number): void {
    while (this.items.length > 0 && now - (this.items[0] as TimedSample).at > this.maxAgeMs) this.items.shift();
  }
  values(): readonly TimedSample[] { return Object.freeze([...this.items]); }
  get size(): number { return this.items.length; }
  latest(): TimedSample | undefined { return this.items[this.items.length - 1]; }
}

export const parseTime = (iso: string): number => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Number.NaN;
};
