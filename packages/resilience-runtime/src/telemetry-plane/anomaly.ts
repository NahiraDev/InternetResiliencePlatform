/**
 * Phase 105 — Anomaly Detection.
 *
 * Deterministic, explainable detectors: robust z-score (median/MAD), an EWMA
 * control band and a one-sided CUSUM change-point test. Detection requires a
 * warm-up baseline and applies a cooldown to avoid alert storms. Detectors emit
 * findings only; they have no actuation path.
 */

import { ewma, median, stddev, mean } from '../analytics/series.js';

export type AnomalyMethod = 'robust-zscore' | 'ewma-band' | 'cusum';
export type AnomalySeverity = 'low' | 'medium' | 'high';

export interface AnomalyFinding {
  readonly seriesId: string;
  readonly atMs: number;
  readonly value: number;
  readonly method: AnomalyMethod;
  readonly score: number;
  readonly direction: 'up' | 'down';
  readonly severity: AnomalySeverity;
  readonly baseline: number;
  readonly reason: string;
}

export interface AnomalyConfig {
  readonly warmup: number;
  readonly baselineSize: number;
  readonly zThreshold: number;
  readonly ewmaAlpha: number;
  readonly ewmaSigmas: number;
  readonly cusumSlack: number;
  readonly cusumThreshold: number;
  readonly cooldownMs: number;
}

export const DEFAULT_ANOMALY_CONFIG: AnomalyConfig = Object.freeze({
  warmup: 12, baselineSize: 60, zThreshold: 3.5, ewmaAlpha: 0.3, ewmaSigmas: 3, cusumSlack: 0.5, cusumThreshold: 5, cooldownMs: 60_000,
});

interface SeriesState { values: number[]; cusumHigh: number; cusumLow: number; lastFindingAt: Map<AnomalyMethod, number> }

const severityOf = (score: number, threshold: number): AnomalySeverity => score >= threshold * 2 ? 'high' : score >= threshold * 1.4 ? 'medium' : 'low';

export class AnomalyDetector {
  private readonly state = new Map<string, SeriesState>();
  constructor(private readonly config: AnomalyConfig = DEFAULT_ANOMALY_CONFIG) {}

  /** Observes one point and returns any findings it triggers (never throws on bad input; ignores non-finite). */
  observe(seriesId: string, atMs: number, value: number): readonly AnomalyFinding[] {
    if (!Number.isFinite(atMs) || !Number.isFinite(value)) return Object.freeze([]);
    let st = this.state.get(seriesId);
    if (!st) { st = { values: [], cusumHigh: 0, cusumLow: 0, lastFindingAt: new Map() }; this.state.set(seriesId, st); }
    const baselineValues = st.values.slice(-this.config.baselineSize);
    const findings: AnomalyFinding[] = [];
    if (baselineValues.length >= this.config.warmup) {
      const med = median(baselineValues) as number;
      const mad = median(baselineValues.map((v) => Math.abs(v - med))) as number;
      const scale = mad > 0 ? mad * 1.4826 : Math.max(1e-9, (stddev(baselineValues) as number) || 1e-9);
      const z = (value - med) / scale;
      this.maybePush(findings, st, seriesId, atMs, value, 'robust-zscore', Math.abs(z), this.config.zThreshold, z >= 0 ? 'up' : 'down', med, `robust z=${z.toFixed(2)}`);

      const center = ewma(baselineValues, this.config.ewmaAlpha) as number;
      const sd = (stddev(baselineValues) as number) || 1e-9;
      const band = this.config.ewmaSigmas * sd;
      if (band > 0 && Math.abs(value - center) > band) {
        const s = Math.abs(value - center) / band * this.config.ewmaSigmas;
        this.maybePush(findings, st, seriesId, atMs, value, 'ewma-band', s, this.config.ewmaSigmas, value >= center ? 'up' : 'down', center, `outside EWMA band ±${band.toFixed(3)}`);
      }

      const m = mean(baselineValues) as number;
      const sigma = sd;
      st.cusumHigh = Math.max(0, st.cusumHigh + (value - m) / sigma - this.config.cusumSlack);
      st.cusumLow = Math.max(0, st.cusumLow + (m - value) / sigma - this.config.cusumSlack);
      if (st.cusumHigh > this.config.cusumThreshold) {
        this.maybePush(findings, st, seriesId, atMs, value, 'cusum', st.cusumHigh, this.config.cusumThreshold, 'up', m, 'sustained upward shift');
        st.cusumHigh = 0;
      } else if (st.cusumLow > this.config.cusumThreshold) {
        this.maybePush(findings, st, seriesId, atMs, value, 'cusum', st.cusumLow, this.config.cusumThreshold, 'down', m, 'sustained downward shift');
        st.cusumLow = 0;
      }
    }
    // Anomalous points are excluded from the baseline so a spike cannot normalize itself.
    if (findings.length === 0) st.values.push(value);
    while (st.values.length > this.config.baselineSize * 2) st.values.shift();
    return Object.freeze(findings);
  }

  private maybePush(out: AnomalyFinding[], st: SeriesState, seriesId: string, atMs: number, value: number, method: AnomalyMethod, score: number, threshold: number, direction: 'up' | 'down', baseline: number, reason: string): void {
    if (score < threshold) return;
    const last = st.lastFindingAt.get(method);
    if (last !== undefined && atMs - last < this.config.cooldownMs) return;
    st.lastFindingAt.set(method, atMs);
    out.push(Object.freeze({ seriesId, atMs, value, method, score, direction, severity: severityOf(score, threshold), baseline, reason }));
  }
}
