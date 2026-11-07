import type { InternalMetricsBus } from '@irp/metrics';
export interface OpenTelemetryConfig {
    enabled: boolean;
    serviceName: string;
    serviceVersion: string;
    environment: string;
    otlpEndpoint?: string;
    otlpTracesEndpoint?: string;
    otlpMetricsEndpoint?: string;
    otlpHeaders?: Record<string, string>;
    sampleRatio: number;
    exportIntervalMs?: number;
    exportTimeoutMs?: number;
}
export interface OpenTelemetryState {
    enabled: boolean;
    sdkStarted: boolean;
    traceExporterConfigured: boolean;
    metricExporterConfigured: boolean;
    serviceName: string;
    serviceVersion: string;
    environment: string;
    sampleRatio: number;
    exportIntervalMs: number;
    exportTimeoutMs: number;
}
export interface OpenTelemetryRuntime {
    state: OpenTelemetryState;
    shutdown: () => Promise<void>;
    unsubscribeMetrics?: () => void;
}
export declare const initializeOpenTelemetry: (config: OpenTelemetryConfig, metricsBus?: InternalMetricsBus) => OpenTelemetryRuntime;
export declare const getOpenTelemetryRuntime: () => OpenTelemetryRuntime | undefined;
//# sourceMappingURL=opentelemetry.d.ts.map