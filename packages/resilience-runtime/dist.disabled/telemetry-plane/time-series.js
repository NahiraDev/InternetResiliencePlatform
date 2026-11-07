/**
 * Phase 104 — Historical Network State & Time-Series Intelligence.
 *
 * A bounded, tiered, in-memory time-series store with deterministic bucketed
 * rollups. Raw points age into coarser buckets by retention tier. Durable
 * persistence stays with the existing persistence boundary; this store is the
 * query and rollup model that both feed.
 */
import { percentile, parseTime } from '../analytics/series.js';
export const DEFAULT_RETENTION_TIERS = Object.freeze([
    { resolutionMs: 0, retentionMs: 60 * 60_000 },
    { resolutionMs: 60_000, retentionMs: 24 * 60 * 60_000 },
    { resolutionMs: 15 * 60_000, retentionMs: 30 * 24 * 60 * 60_000 },
]);
export class TimeSeriesStore {
    maxPointsPerSeries;
    series = new Map();
    tiers;
    constructor(tiers = DEFAULT_RETENTION_TIERS, maxPointsPerSeries = 50_000) {
        this.maxPointsPerSeries = maxPointsPerSeries;
        if (tiers.length === 0)
            throw new Error('at least one retention tier is required');
        const sorted = [...tiers].sort((a, b) => a.resolutionMs - b.resolutionMs);
        sorted.forEach((t, i) => { if (i > 0 && t.retentionMs < sorted[i - 1].retentionMs)
            throw new Error('coarser retention tiers must not retain less than finer tiers'); });
        this.tiers = Object.freeze(sorted);
    }
    record(seriesId, at, value) {
        const atMs = typeof at === 'number' ? at : parseTime(at);
        if (!Number.isFinite(atMs) || !Number.isFinite(value))
            throw new Error('time-series point must have finite time and value');
        const points = this.series.get(seriesId) ?? [];
        points.push({ atMs, value });
        points.sort((a, b) => a.atMs - b.atMs);
        while (points.length > this.maxPointsPerSeries)
            points.shift();
        this.series.set(seriesId, points);
    }
    seriesIds() { return Object.freeze([...this.series.keys()].sort()); }
    /** Drops points older than the longest tier; returns the number removed. */
    expire(nowMs) {
        const horizon = nowMs - this.tiers[this.tiers.length - 1].retentionMs;
        let removed = 0;
        for (const [id, points] of this.series) {
            const kept = points.filter((p) => p.atMs >= horizon);
            removed += points.length - kept.length;
            if (kept.length === 0)
                this.series.delete(id);
            else
                this.series.set(id, kept);
        }
        return removed;
    }
    /** Finest tier whose retention still covers `nowMs - fromMs`, no finer than requested. */
    resolutionFor(fromMs, nowMs, requested = 0) {
        const age = nowMs - fromMs;
        const covering = this.tiers.find((t) => t.retentionMs >= age && t.resolutionMs >= requested) ?? this.tiers[this.tiers.length - 1];
        return covering.resolutionMs;
    }
    raw(seriesId, fromMs, toMs) {
        return Object.freeze((this.series.get(seriesId) ?? []).filter((p) => p.atMs >= fromMs && p.atMs <= toMs));
    }
    query(seriesId, q) {
        const resolution = q.resolutionMs ?? 60_000;
        if (resolution <= 0)
            throw new Error('rollup resolution must be positive');
        const buckets = new Map();
        for (const p of this.raw(seriesId, q.fromMs, q.toMs)) {
            const start = Math.floor(p.atMs / resolution) * resolution;
            buckets.set(start, [...(buckets.get(start) ?? []), p.value]);
        }
        return Object.freeze([...buckets.entries()].sort(([a], [b]) => a - b).map(([start, values]) => Object.freeze({
            startMs: start, endMs: start + resolution, count: values.length, min: Math.min(...values), max: Math.max(...values),
            mean: values.reduce((s, v) => s + v, 0) / values.length, p95: percentile(values, 95),
        })));
    }
    /** Compares two windows of the same series (e.g. now vs baseline). */
    compareWindows(seriesId, current, baseline) {
        const mean = (q) => { const v = this.raw(seriesId, q.fromMs, q.toMs).map((p) => p.value); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : undefined; };
        const c = mean(current);
        const b = mean(baseline);
        return Object.freeze({
            ...(c !== undefined ? { currentMean: c } : {}), ...(b !== undefined ? { baselineMean: b } : {}),
            ...(c !== undefined && b !== undefined && b !== 0 ? { relativeChange: (c - b) / Math.abs(b) } : {}),
        });
    }
}
//# sourceMappingURL=time-series.js.map