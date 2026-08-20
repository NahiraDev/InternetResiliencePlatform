import { describe, expect, it } from 'vitest';
import {
  InMemoryHistoricalMeasurementStore,
  createHistoricalReport,
  exportHistoricalReportCsv,
  exportHistoricalReportJson,
  type HistoricalMeasurement,
} from './index.js';

const base = Date.parse('2026-01-01T00:00:00.000Z');
const at = (hours: number) => new Date(base + hours * 60 * 60 * 1000).toISOString();

const measurement = (
  hours: number,
  success: boolean,
  latencyMs: number,
  probeType = 'https',
  packetLossPercent = success ? 0 : 100,
): HistoricalMeasurement => ({
  id: `${probeType}-${hours}`,
  timestamp: at(hours),
  probeType,
  success,
  latencyMs,
  packetLossPercent,
});

describe('@irp/historical-analysis', () => {
  it('queries a bounded time range and filters probe types', async () => {
    const store = new InMemoryHistoricalMeasurementStore([
      measurement(0, true, 20, 'https'),
      measurement(1, true, 30, 'dns'),
      measurement(2, true, 40, 'https'),
      measurement(4, true, 50, 'https'),
    ]);

    const result = await store.query({
      from: at(0),
      to: at(4),
      probeTypes: ['https'],
    });

    expect(result.map((item) => item.id)).toEqual(['https-0', 'https-2']);
  });

  it('builds deterministic summaries, buckets, and trends', async () => {
    const store = new InMemoryHistoricalMeasurementStore([
      measurement(0, true, 20),
      measurement(1, true, 30),
      measurement(2, true, 40),
      measurement(3, false, 50),
    ]);

    const report = await createHistoricalReport(
      store,
      { from: at(0), to: at(4) },
      { now: () => new Date('2026-01-02T00:00:00.000Z') },
    );

    expect(report.generatedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(report.summary.sampleCount).toBe(4);
    expect(report.summary.successCount).toBe(3);
    expect(report.summary.availabilityPercent).toBe(75);
    expect(report.summary.averageLatencyMs).toBe(35);
    expect(report.summary.p95LatencyMs).toBe(48.5);
    expect(report.trends.find((trend) => trend.metric === 'latency')?.direction).toBe('worsening');
    expect(report.trends.find((trend) => trend.metric === 'availability')?.direction).toBe('worsening');
    expect(report.series).toHaveLength(1);
    expect(report.series[0].probeType).toBe('https');
  });

  it('selects coarser buckets for longer ranges', async () => {
    const store = new InMemoryHistoricalMeasurementStore([
      measurement(0, true, 20),
      measurement(24 * 8, true, 20),
    ]);
    const report = await createHistoricalReport(store, {
      from: at(0),
      to: at(24 * 10),
    });
    expect(report.bucketSize).toBe('day');
  });

  it('rejects invalid ranges and measurements', async () => {
    expect(() => new InMemoryHistoricalMeasurementStore([
      { timestamp: 'not-a-date', probeType: 'https', success: true },
    ])).toThrow('invalid ISO timestamp');

    const store = new InMemoryHistoricalMeasurementStore();
    await expect(store.query({ from: at(2), to: at(1) })).rejects.toThrow(
      'historical query requires from < to',
    );
  });

  it('exports stable CSV and JSON representations', async () => {
    const store = new InMemoryHistoricalMeasurementStore([
      measurement(0, true, 20),
      measurement(1, false, 40),
    ]);
    const report = await createHistoricalReport(store, { from: at(0), to: at(2) });

    const csv = exportHistoricalReportCsv(report);
    expect(csv.startsWith('probeType,bucketStart,bucketEnd')).toBe(true);
    expect(csv.endsWith('\n')).toBe(true);
    expect(csv).toContain('https,');

    const json = exportHistoricalReportJson(report);
    expect(JSON.parse(json)).toMatchObject({
      summary: { sampleCount: 2 },
      bucketSize: 'hour',
    });
    expect(json.endsWith('\n')).toBe(true);
  });

  it('caps excessive query limits', async () => {
    const store = new InMemoryHistoricalMeasurementStore([measurement(0, true, 20)]);
    const result = await store.query({ from: at(0), to: at(1), limit: 999_999_999 });
    expect(result).toHaveLength(1);
  });
});
