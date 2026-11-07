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
    range: {
        from: string;
        to: string;
    };
    summary: AnalyticsSummary;
    trends: AnalyticsTrend[];
    anomalies: AnalyticsAnomaly[];
}
export declare const summarizeMeasurements: (measurements: readonly HistoricalMeasurement[]) => AnalyticsSummary;
export declare const detectAnomalies: (measurements: readonly HistoricalMeasurement[], options?: {
    thresholdPercent?: number;
    baselineWindow?: number;
}) => AnalyticsAnomaly[];
export declare const createAnalyticsReport: (measurements: readonly HistoricalMeasurement[], range: {
    from: string;
    to: string;
}, now?: Date) => AnalyticsReport;
//# sourceMappingURL=analytics.d.ts.map