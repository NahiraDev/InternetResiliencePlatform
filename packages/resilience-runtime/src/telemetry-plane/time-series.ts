/**
 * Phase 104 — Historical Network State & Time-Series Intelligence.
 *
 * A bounded, tiered, in-memory time-series store with deterministic bucketed
 * rollups. Raw points age into coarser buckets by retention tier. Durable
 * persistence stays with the existing persistence boundary; this store is the
 * query and rollup model that both feed.
 */

import { percentile, parseTime } from '../analytics/series.js';

export interface SeriesPoint { readonly atMs: number; readonly value: number }

export interface RetentionTier {
  /** Bucket width in ms; 0 means raw points. */
  readonly resolutionMs: number;
  readonly retentionMs: number;
}

export const DEFAULT_RETENTION_TIERS: readonly RetentionTier[] = Object.freeze([
  { resolutionMs: 0, retentionMs: 60 * 60_000 },
  { resolutionMs: 60_000, retentionMs: 24 * 60 * 60_000 },
  { resolutionMs: 15 * 60_000, retentionMs: 30 * 24 * 60 * 60_000 },
]);

export interface RollupBucket {
  readonly startMs: number;
  readonly endMs: number;
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly p95: number;
}

export interface SeriesQuery { readonly fromMs: number; readonly toMs: number; readonly resolutionMs?: number }

export class TimeSeriesStore {
  private readonly series = new Map<string, SeriesPoint[]>();
  private readonly tiers: readonly RetentionTier[];
  constructor(tiers: readonly RetentionTier[] = DEFAULT_RETENTION_TIERS, private readonly maxPointsPerSeries = 50_000) {
    if (tiers.length === 0) throw new Error('at least one retention tier is required');
    const sorted = [...tiers].sort((a, b) => a.resolutionMs - b.resolutionMs);
    sorted.forEach((t, i) => { if (i > 0 && t.retentionMs < (sorted[i - 1] as RetentionTier).retentionMs) throw new Error('coarser retention tiers must not retain less than finer tiers'); });
    this.tiers = Object.freeze(sorted);
  }

  record(seriesId: string, at: string | number, value: number): void {
    const atMs = typeof at === 'number' ? at : parseTime(at);
    if (!Number.isFinite(atMs) || !Number.isFinite(value)) throw new Error('time-series point must have finite time and value');
    const points = this.series.get(seriesId) ?? [];
    points.push({ atMs, value });
    points.sort((a, b) => a.atMs - b.atMs);
    while (points.length > this.maxPointsPerSeries) points.shift();
    this.series.set(seriesId, points);
  }

  seriesIds(): readonly string[] { return Object.freeze([...this.series.keys()].sort()); }

  /** Drops points older than the longest tier; returns the number removed. */
  expire(nowMs: number): number {
    const horizon = nowMs - (this.tiers[this.tiers.length - 1] as RetentionTier).retentionMs;
    let removed = 0;
    for (const [id, points] of this.series) {
      const kept = points.filter((p) => p.atMs >= horizon);
      removed += points.length - kept.length;
      if (kept.length === 0) this.series.delete(id); else this.series.set(id, kept);
    }
    return removed;
  }

  /** Finest tier whose retention still covers `nowMs - fromMs`, no finer than requested. */
  resolutionFor(fromMs: number, nowMs: number, requested = 0): number {
    const age = nowMs - fromMs;
    const covering = this.tiers.find((t) => t.retentionMs >= age && t.resolutionMs >= requested) ?? this.tiers[this.tiers.length - 1] as RetentionTier;
    return covering.resolutionMs;
  }

  raw(seriesId: string, fromMs: number, toMs: number): readonly SeriesPoint[] {
    return Object.freeze((this.series.get(seriesId) ?? []).filter((p) => p.atMs >= fromMs && p.atMs <= toMs));
  }

  query(seriesId: string, q: SeriesQuery): readonly RollupBucket[] {
    const resolution = q.resolutionMs ?? 60_000;
    if (resolution <= 0) throw new Error('rollup resolution must be positive');
    const buckets = new Map<number, number[]>();
    for (const p of this.raw(seriesId, q.fromMs, q.toMs)) {
      const start = Math.floor(p.atMs / resolution) * resolution;
      buckets.set(start, [...(buckets.get(start) ?? []), p.value]);
    }
    return Object.freeze([...buckets.entries()].sort(([a], [b]) => a - b).map(([start, values]) => Object.freeze({
      startMs: start, endMs: start + resolution, count: values.length, min: Math.min(...values), max: Math.max(...values),
      mean: values.reduce((s, v) => s + v, 0) / values.length, p95: percentile(values, 95) as number,
    })));
  }

  /** Compares two windows of the same series (e.g. now vs baseline). */
  compareWindows(seriesId: string, current: SeriesQuery, baseline: SeriesQuery): { readonly currentMean?: number; readonly baselineMean?: number; readonly relativeChange?: number } {
    const mean = (q: SeriesQuery) => { const v = this.raw(seriesId, q.fromMs, q.toMs).map((p) => p.value); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : undefined; };
    const c = mean(current); const b = mean(baseline);
    return Object.freeze({
      ...(c !== undefined ? { currentMean: c } : {}), ...(b !== undefined ? { baselineMean: b } : {}),
      ...(c !== undefined && b !== undefined && b !== 0 ? { relativeChange: (c - b) / Math.abs(b) } : {}),
    });
  }
}
