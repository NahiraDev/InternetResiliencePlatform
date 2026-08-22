import { describe, expect, it } from 'vitest';
import { createAnalyticsReport, detectAnomalies, summarizeMeasurements } from './analytics.js';
import type { HistoricalMeasurement } from './index.js';

const samples: HistoricalMeasurement[] = Array.from({ length: 8 }, (_, i) => ({
  timestamp: new Date(Date.UTC(2026, 0, 1, i)).toISOString(),
  probeType: 'https',
  success: i !== 7,
  latencyMs: 20 + i,
  packetLossPercent: i === 7 ? 10 : 0,
}));

describe('data analytics', () => {
  it('calculates bounded summary statistics', () => {
    const summary = summarizeMeasurements(samples);
    expect(summary.sampleCount).toBe(8);
    expect(summary.successCount).toBe(7);
    expect(summary.availabilityPercent).toBe(87.5);
    expect(summary.p50LatencyMs).toBe(23.5);
    expect(summary.p95LatencyMs).toBe(26.65);
  });

  it('returns explicit insufficient-data trends', () => {
    const report = createAnalyticsReport(samples.slice(0, 1), {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-01T02:00:00.000Z',
    }, new Date('2026-01-02T00:00:00.000Z'));
    expect(report.trends.every((trend) => trend.direction === 'insufficient-data')).toBe(true);
  });

  it('detects adverse latency anomalies against a recent baseline', () => {
    const measurements: HistoricalMeasurement[] = Array.from({ length: 5 }, (_, i) => ({
      timestamp: new Date(Date.UTC(2026, 0, 1, i)).toISOString(),
      probeType: 'https', success: true, latencyMs: 20,
    }));
    measurements.push({
      timestamp: '2026-01-01T05:00:00.000Z', probeType: 'https', success: true, latencyMs: 60,
    });
    const anomalies = detectAnomalies(measurements, { thresholdPercent: 50, baselineWindow: 5 });
    expect(anomalies.some((item) => item.metric === 'latency' && item.severity === 'warning')).toBe(true);
  });

  it('rejects invalid analytics ranges', () => {
    expect(() => createAnalyticsReport([], {
      from: '2026-01-02T00:00:00.000Z',
      to: '2026-01-01T00:00:00.000Z',
    })).toThrow('analytics range requires valid from < to');
  });
});
