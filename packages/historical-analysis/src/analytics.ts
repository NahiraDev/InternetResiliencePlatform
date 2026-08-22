import type { HistoricalMeasurement } from './index.js';

export type AnalyticsMetric = 'availability' | 'latency' | 'packetLoss';
export type AnalyticsSeverity = 'info' | 'warning' | 'critical';

export interface AnalyticsSummary {
  sampleCount: number;
  successCount: number;
  availabilityPercent: number | null;
  averageLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  p99LatencyMs: number | null;
  averagePacketLossPercent: number | null;
}

export interface AnalyticsTrend {
  metric: AnalyticsMetric;
  direction: 'improving' | 'worsening' | 'stable' | 'insufficient-data';
  changePercent: number | null;
  confidencePercent: number;
  sampleCount: number;
}

export interface AnalyticsAnomaly {
  metric: AnalyticsMetric;
  observedValue: number;
  baselineValue: number;
  deviationPercent: number;
  severity: AnalyticsSeverity;
  confidencePercent: number;
  reason: string;
  timestamp: string;
}

export interface AnalyticsReport {
  generatedAt: string;
  range: { from: string; to: string };
  summary: AnalyticsSummary;
  trends: AnalyticsTrend[];
  anomalies: AnalyticsAnomaly[];
}

const MAX_SAMPLES = 100_000;
const MAX_ANOMALIES = 1_000;
const round = (n: number, d = 2): number => {
  const factor = 10 ** d;
  return Math.round(n * factor) / factor;
};

const percentile = (values: readonly number[], rank: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * rank;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return round(lower === upper ? sorted[lower]! : sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower));
};

const average = (values: readonly number[]): number | null => values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : null;

export const summarizeMeasurements = (measurements: readonly HistoricalMeasurement[]): AnalyticsSummary => {
  if (measurements.length > MAX_SAMPLES) throw new Error(`analytics sample limit exceeded: ${MAX_SAMPLES}`);
  const latencies = measurements.flatMap((m) => m.latencyMs === undefined ? [] : [m.latencyMs]);
  const losses = measurements.flatMap((m) => m.packetLossPercent === undefined ? [] : [m.packetLossPercent]);
  const successCount = measurements.filter((m) => m.success).length;
  return {
    sampleCount: measurements.length,
    successCount,
    availabilityPercent: measurements.length ? round((successCount / measurements.length) * 100) : null,
    averageLatencyMs: average(latencies),
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    p99LatencyMs: percentile(latencies, 0.99),
    averagePacketLossPercent: average(losses),
  };
};

const metricValue = (metric: AnalyticsMetric, m: HistoricalMeasurement): number | undefined =>
  metric === 'availability' ? (m.success ? 100 : 0) : metric === 'latency' ? m.latencyMs : m.packetLossPercent;

export const detectAnomalies = (measurements: readonly HistoricalMeasurement[], options: { thresholdPercent?: number; baselineWindow?: number } = {}): AnalyticsAnomaly[] => {
  const threshold = Math.max(1, options.thresholdPercent ?? 50);
  const baselineWindow = Math.min(Math.max(3, Math.floor(options.baselineWindow ?? 20)), 500);
  const ordered = [...measurements].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const anomalies: AnalyticsAnomaly[] = [];
  for (const metric of ['availability', 'latency', 'packetLoss'] as const) {
    const history: number[] = [];
    for (const measurement of ordered) {
      const value = metricValue(metric, measurement);
      if (value === undefined) continue;
      const baselineValues = history.slice(-baselineWindow);
      if (baselineValues.length >= 3) {
        const baseline = baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length;
        const denominator = Math.max(Math.abs(baseline), 0.001);
        const deviation = Math.abs(value - baseline) / denominator * 100;
        if (deviation >= threshold) {
          const confidence = Math.min(100, 50 + baselineValues.length * 2);
          const adverse = metric === 'availability' ? value < baseline : value > baseline;
          if (adverse) anomalies.push({
            metric,
            observedValue: round(value),
            baselineValue: round(baseline),
            deviationPercent: round(deviation),
            severity: deviation >= threshold * 2 ? 'critical' : 'warning',
            confidencePercent: round(confidence),
            reason: `${metric} deviated ${round(deviation)}% from the recent baseline`,
            timestamp: measurement.timestamp,
          });
        }
      }
      history.push(value);
    }
  }
  return anomalies.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).slice(-MAX_ANOMALIES);
};

export const createAnalyticsReport = (measurements: readonly HistoricalMeasurement[], range: { from: string; to: string }, now = new Date()): AnalyticsReport => {
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error('analytics range requires valid from < to');
  const ordered = [...measurements].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const summary = summarizeMeasurements(ordered);
  const trends = (['availability', 'latency', 'packetLoss'] as const).map((metric): AnalyticsTrend => {
    const values = ordered.flatMap((m) => { const v = metricValue(metric, m); return v === undefined ? [] : [v]; });
    if (values.length < 2) return { metric, direction: 'insufficient-data', changePercent: null, confidencePercent: 0, sampleCount: values.length };
    const first = values[0]!;
    const last = values[values.length - 1]!;
    const changePercent = Math.abs(first) < 0.001 ? null : round(((last - first) / Math.abs(first)) * 100);
    const improving = metric === 'availability' ? last > first : last < first;
    const worsening = metric === 'availability' ? last < first : last > first;
    return { metric, direction: improving ? 'improving' : worsening ? 'worsening' : 'stable', changePercent, confidencePercent: values.length >= 10 ? 80 : 50, sampleCount: values.length };
  });
  return { generatedAt: now.toISOString(), range: { from: new Date(from).toISOString(), to: new Date(to).toISOString() }, summary, trends, anomalies: detectAnomalies(ordered) };
};
