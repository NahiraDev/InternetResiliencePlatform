import type { DatabaseClient } from '@irp/database';

export type HistoricalMetric = 'availability' | 'latency' | 'packetLoss';
export type BucketSize = 'hour' | 'six-hour' | 'day' | 'week';
export type TrendDirection = 'improving' | 'worsening' | 'stable' | 'insufficient-data';

export interface HistoricalMeasurement {
  id?: string;
  timestamp: string;
  probeType: string;
  success: boolean;
  latencyMs?: number;
  packetLossPercent?: number;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface HistoricalQuery {
  from: string;
  to: string;
  probeTypes?: readonly string[];
  limit?: number;
}

export interface HistoricalMeasurementStore {
  query(query: HistoricalQuery): Promise<HistoricalMeasurement[]>;
}

export interface HistoricalBucket {
  start: string;
  end: string;
  sampleCount: number;
  successCount: number;
  availabilityPercent: number;
  averageLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  p99LatencyMs: number | null;
  averagePacketLossPercent: number | null;
}

export interface HistoricalTrend {
  metric: HistoricalMetric;
  direction: TrendDirection;
  slopePerHour: number | null;
  changePercent: number | null;
  confidence: number;
  firstValue: number | null;
  lastValue: number | null;
  sampleCount: number;
}

export interface HistoricalSummary {
  sampleCount: number;
  successCount: number;
  availabilityPercent: number | null;
  averageLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  p99LatencyMs: number | null;
  averagePacketLossPercent: number | null;
}

export interface HistoricalSeries {
  probeType: string;
  summary: HistoricalSummary;
  buckets: HistoricalBucket[];
  trends: HistoricalTrend[];
}

export interface HistoricalReport {
  generatedAt: string;
  range: { from: string; to: string };
  bucketSize: BucketSize;
  summary: HistoricalSummary;
  buckets: HistoricalBucket[];
  trends: HistoricalTrend[];
  series: HistoricalSeries[];
}

export interface HistoricalAnalysisOptions {
  now?: () => Date;
  maxSamples?: number;
}

const DEFAULT_MAX_SAMPLES = 50_000;
const MAX_QUERY_SAMPLES = 100_000;
const EPSILON = 1e-9;

const clamp = (value: number, min = 0, max = 100): number =>
  Math.min(max, Math.max(min, value));

const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const parseTimestamp = (value: string): number => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`invalid ISO timestamp: ${value}`);
  return timestamp;
};

const validateRange = (query: HistoricalQuery): { from: number; to: number } => {
  const from = parseTimestamp(query.from);
  const to = parseTimestamp(query.to);
  if (from >= to) throw new Error('historical query requires from < to');
  return { from, to };
};

const percentile = (values: readonly number[], percentileRank: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (sorted.length - 1) * percentileRank;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return round(sorted[lower]);
  return round(sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower));
};

const average = (values: readonly number[]): number | null =>
  values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

const validateMeasurement = (measurement: HistoricalMeasurement): void => {
  parseTimestamp(measurement.timestamp);
  if (!measurement.probeType.trim()) throw new Error('probeType is required');
  if (measurement.latencyMs !== undefined && (!Number.isFinite(measurement.latencyMs) || measurement.latencyMs < 0)) {
    throw new Error('latencyMs must be a non-negative finite number');
  }
  if (
    measurement.packetLossPercent !== undefined &&
    (!Number.isFinite(measurement.packetLossPercent) || measurement.packetLossPercent < 0 || measurement.packetLossPercent > 100)
  ) {
    throw new Error('packetLossPercent must be between 0 and 100');
  }
};

const summarize = (measurements: readonly HistoricalMeasurement[]): HistoricalSummary => {
  const latency = measurements.flatMap((measurement) =>
    measurement.latencyMs === undefined ? [] : [measurement.latencyMs],
  );
  const packetLoss = measurements.flatMap((measurement) =>
    measurement.packetLossPercent === undefined ? [] : [measurement.packetLossPercent],
  );
  const successCount = measurements.filter((measurement) => measurement.success).length;

  return {
    sampleCount: measurements.length,
    successCount,
    availabilityPercent: measurements.length ? round((successCount / measurements.length) * 100) : null,
    averageLatencyMs: average(latency),
    p50LatencyMs: percentile(latency, 0.5),
    p95LatencyMs: percentile(latency, 0.95),
    p99LatencyMs: percentile(latency, 0.99),
    averagePacketLossPercent: average(packetLoss),
  };
};

const chooseBucketSize = (durationMs: number): BucketSize => {
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (durationMs <= day) return 'hour';
  if (durationMs <= 7 * day) return 'six-hour';
  if (durationMs <= 30 * day) return 'day';
  return 'week';
};

const bucketDurationMs = (bucketSize: BucketSize): number => {
  const hour = 60 * 60 * 1000;
  if (bucketSize === 'hour') return hour;
  if (bucketSize === 'six-hour') return 6 * hour;
  if (bucketSize === 'day') return 24 * hour;
  return 7 * 24 * hour;
};

const buildBuckets = (
  measurements: readonly HistoricalMeasurement[],
  from: number,
  to: number,
  bucketSize: BucketSize,
): HistoricalBucket[] => {
  const duration = bucketDurationMs(bucketSize);
  const buckets: HistoricalBucket[] = [];
  for (let start = from; start < to; start += duration) {
    const end = Math.min(start + duration, to);
    const items = measurements.filter((measurement) => {
      const timestamp = Date.parse(measurement.timestamp);
      return timestamp >= start && timestamp < end;
    });
    const summary = summarize(items);
    buckets.push({
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      sampleCount: summary.sampleCount,
      successCount: summary.successCount,
      availabilityPercent: summary.availabilityPercent ?? 0,
      averageLatencyMs: summary.averageLatencyMs,
      p50LatencyMs: summary.p50LatencyMs,
      p95LatencyMs: summary.p95LatencyMs,
      p99LatencyMs: summary.p99LatencyMs,
      averagePacketLossPercent: summary.averagePacketLossPercent,
    });
  }
  return buckets;
};

interface TrendPoint {
  x: number;
  y: number;
}

const calculateTrend = (
  metric: HistoricalMetric,
  measurements: readonly HistoricalMeasurement[],
): HistoricalTrend => {
  const points: TrendPoint[] = [];
  for (const measurement of measurements) {
    const timestamp = Date.parse(measurement.timestamp);
    const value =
      metric === 'availability'
        ? measurement.success
          ? 100
          : 0
        : metric === 'latency'
          ? measurement.latencyMs
          : measurement.packetLossPercent;
    if (value !== undefined && Number.isFinite(value)) points.push({ x: timestamp, y: value });
  }

  if (points.length < 2) {
    return {
      metric,
      direction: 'insufficient-data',
      slopePerHour: null,
      changePercent: null,
      confidence: 0,
      firstValue: points[0]?.y ?? null,
      lastValue: points[points.length - 1]?.y ?? null,
      sampleCount: points.length,
    };
  }

  const first = points[0].y;
  const last = points[points.length - 1].y;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  const covariance = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0);
  const slopePerMs = denominator > EPSILON ? covariance / denominator : 0;
  const slopePerHour = slopePerMs * 60 * 60 * 1000;
  const totalVariance = points.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
  const residualVariance = points.reduce(
    (sum, point) => sum + (point.y - (meanY + slopePerMs * (point.x - meanX))) ** 2,
    0,
  );
  const rSquared = totalVariance > EPSILON ? clamp(1 - residualVariance / totalVariance) : 1;
  const changePercent = Math.abs(first) > EPSILON ? round(((last - first) / Math.abs(first)) * 100) : null;
  const meaningfulSlope = Math.abs(slopePerHour) < 0.001 || rSquared < 0.25 ? 0 : slopePerHour;
  const direction = meaningfulSlope === 0
    ? 'stable'
    : metric === 'latency' || metric === 'packetLoss'
      ? meaningfulSlope < 0 ? 'improving' : 'worsening'
      : meaningfulSlope > 0 ? 'improving' : 'worsening';

  return {
    metric,
    direction,
    slopePerHour: round(slopePerHour, 4),
    changePercent,
    confidence: round(rSquared * 100),
    firstValue: round(first),
    lastValue: round(last),
    sampleCount: points.length,
  };
};

const createSeries = (
  probeType: string,
  measurements: readonly HistoricalMeasurement[],
  from: number,
  to: number,
  bucketSize: BucketSize,
): HistoricalSeries => ({
  probeType,
  summary: summarize(measurements),
  buckets: buildBuckets(measurements, from, to, bucketSize),
  trends: [
    calculateTrend('availability', measurements),
    calculateTrend('latency', measurements),
    calculateTrend('packetLoss', measurements),
  ],
});

export class InMemoryHistoricalMeasurementStore implements HistoricalMeasurementStore {
  private readonly measurements: HistoricalMeasurement[];

  constructor(measurements: readonly HistoricalMeasurement[] = []) {
    this.measurements = [];
    for (const measurement of measurements) this.add(measurement);
  }

  add(measurement: HistoricalMeasurement): void {
    validateMeasurement(measurement);
    this.measurements.push({
      ...measurement,
      metadata: measurement.metadata ? { ...measurement.metadata } : undefined,
    });
  }

  async query(query: HistoricalQuery): Promise<HistoricalMeasurement[]> {
    const { from, to } = validateRange(query);
    const limit = Math.min(Math.max(1, Math.floor(query.limit ?? DEFAULT_MAX_SAMPLES)), MAX_QUERY_SAMPLES);
    const probeTypes = query.probeTypes ? new Set(query.probeTypes) : undefined;
    return this.measurements
      .filter((measurement) => {
        const timestamp = Date.parse(measurement.timestamp);
        return timestamp >= from && timestamp < to && (!probeTypes || probeTypes.has(measurement.probeType));
      })
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
      .slice(0, limit)
      .map((measurement) => ({ ...measurement, metadata: measurement.metadata ? { ...measurement.metadata } : undefined }));
  }
}

export class PostgresHistoricalMeasurementStore implements HistoricalMeasurementStore {
  constructor(private readonly client: Pick<DatabaseClient, '$queryRaw'>) {}

  async query(query: HistoricalQuery): Promise<HistoricalMeasurement[]> {
    const { from, to } = validateRange(query);
    const limit = Math.min(Math.max(1, Math.floor(query.limit ?? DEFAULT_MAX_SAMPLES)), MAX_QUERY_SAMPLES);
    const rows = await this.client.$queryRaw`
      SELECT id, timestamp, "probeType", success, latency, metadata
      FROM "NetworkMeasurement"
      WHERE timestamp >= ${new Date(from)}
        AND timestamp < ${new Date(to)}
      ORDER BY timestamp ASC
      LIMIT ${limit}
    `;
    if (!Array.isArray(rows)) throw new Error('historical measurement query returned an invalid result');
    const probeTypes = query.probeTypes ? new Set(query.probeTypes) : undefined;
    return rows.flatMap((row) => {
      if (!row || typeof row !== 'object') return [];
      const record = row as Record<string, unknown>;
      const probeType = typeof record.probeType === 'string' ? record.probeType : '';
      if (!probeType || (probeTypes && !probeTypes.has(probeType))) return [];
      const metadata = record.metadata && typeof record.metadata === 'object'
        ? (record.metadata as Record<string, unknown>)
        : undefined;
      const packetLossValue = metadata?.packetLossPercent;
      const packetLossPercent = typeof packetLossValue === 'number' ? packetLossValue : undefined;
      const timestamp = record.timestamp instanceof Date ? record.timestamp.toISOString() : String(record.timestamp);
      const latencyMs = typeof record.latency === 'number' ? record.latency : undefined;
      const success = record.success === true;
      const id = typeof record.id === 'string' ? record.id : undefined;
      return [{ id, timestamp, probeType, success, latencyMs, packetLossPercent, metadata }];
    });
  }
}

export const createHistoricalReport = async (
  store: HistoricalMeasurementStore,
  query: HistoricalQuery,
  options: HistoricalAnalysisOptions = {},
): Promise<HistoricalReport> => {
  const { from, to } = validateRange(query);
  const maxSamples = Math.min(Math.max(1, Math.floor(options.maxSamples ?? DEFAULT_MAX_SAMPLES)), MAX_QUERY_SAMPLES);
  const measurements = (await store.query({ ...query, limit: Math.min(query.limit ?? maxSamples, maxSamples) }))
    .map((measurement) => ({ ...measurement }))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  for (const measurement of measurements) validateMeasurement(measurement);

  const bucketSize = chooseBucketSize(to - from);
  const probeTypes = [...new Set(measurements.map((measurement) => measurement.probeType))].sort();
  const summary = summarize(measurements);
  return {
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    range: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
    bucketSize,
    summary,
    buckets: buildBuckets(measurements, from, to, bucketSize),
    trends: [
      calculateTrend('availability', measurements),
      calculateTrend('latency', measurements),
      calculateTrend('packetLoss', measurements),
    ],
    series: probeTypes.map((probeType) =>
      createSeries(probeType, measurements.filter((measurement) => measurement.probeType === probeType), from, to, bucketSize),
    ),
  };
};

const csvEscape = (value: string | number | null): string => {
  const text = value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const exportHistoricalReportCsv = (report: HistoricalReport): string => {
  const lines = [
    'probeType,bucketStart,bucketEnd,sampleCount,successCount,availabilityPercent,averageLatencyMs,p50LatencyMs,p95LatencyMs,p99LatencyMs,averagePacketLossPercent',
  ];
  for (const series of report.series) {
    for (const bucket of series.buckets) {
      lines.push([
        csvEscape(series.probeType),
        bucket.start,
        bucket.end,
        bucket.sampleCount,
        bucket.successCount,
        bucket.availabilityPercent,
        bucket.averageLatencyMs,
        bucket.p50LatencyMs,
        bucket.p95LatencyMs,
        bucket.p99LatencyMs,
        bucket.averagePacketLossPercent,
      ].join(','));
    }
  }
  return `${lines.join('\n')}\n`;
};

export const exportHistoricalReportJson = (report: HistoricalReport): string =>
  JSON.stringify(report, null, 2) + '\n';
