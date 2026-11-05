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
    range: {
        from: string;
        to: string;
    };
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
export declare class InMemoryHistoricalMeasurementStore implements HistoricalMeasurementStore {
    private readonly measurements;
    constructor(measurements?: readonly HistoricalMeasurement[]);
    add(measurement: HistoricalMeasurement): void;
    query(query: HistoricalQuery): Promise<HistoricalMeasurement[]>;
}
export declare class PostgresHistoricalMeasurementStore implements HistoricalMeasurementStore {
    private readonly client;
    constructor(client: Pick<DatabaseClient, '$queryRaw'>);
    query(query: HistoricalQuery): Promise<HistoricalMeasurement[]>;
}
export declare const createHistoricalReport: (store: HistoricalMeasurementStore, query: HistoricalQuery, options?: HistoricalAnalysisOptions) => Promise<HistoricalReport>;
export declare const exportHistoricalReportCsv: (report: HistoricalReport) => string;
export declare const exportHistoricalReportJson: (report: HistoricalReport) => string;
//# sourceMappingURL=index.d.ts.map