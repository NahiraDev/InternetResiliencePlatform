import client from 'prom-client';
import { type Span } from '@opentelemetry/api';
import type { HealthState } from '@irp/types';
export interface Metric {
    name: string;
    value: number;
    labels?: Record<string, string>;
    timestamp: string;
}
export type ErrorCategory = 'configuration' | 'validation' | 'authentication' | 'authorization' | 'database' | 'network' | 'timeout' | 'dependency' | 'runtime' | 'internal';
export interface TelemetryConfig {
    enabled: boolean;
    serviceName: string;
    serviceVersion: string;
    environment: string;
    otlpEndpoint?: string;
    sampleRatio: number;
    prometheus: boolean;
}
export interface RequestContext {
    requestId: string;
    traceId?: string;
    spanId?: string;
}
export declare class MetricsRegistry {
    private readonly metrics;
    record(name: string, value: number, labels?: Record<string, string>): void;
    gauge(name: string, value: number, labels?: Record<string, string>): void;
    snapshot(): Metric[];
    prometheus(): string;
    collectRuntime(): void;
}
export interface HealthStatus {
    state: HealthState;
    checks: Record<string, HealthState>;
    updatedAt: string;
    diagnostics?: Record<string, unknown>;
}
export declare const createHealthStatus: (checks: Record<string, HealthState>, diagnostics?: Record<string, unknown>) => HealthStatus;
export declare const prometheusRegister: client.Registry<"text/plain; version=0.0.4; charset=utf-8">;
export declare const httpRequestTotal: client.Counter<"method" | "route" | "status_class">;
export declare const httpActiveRequests: client.Gauge<"method" | "route">;
export declare const httpRequestDuration: client.Histogram<"method" | "route" | "status_class" | "status_code">;
export declare const dependencyLatencyMs: client.Histogram<"status" | "dependency" | "operation">;
export declare const dependencyFailuresTotal: client.Counter<"dependency" | "operation" | "category">;
export declare const telemetryFailuresTotal: client.Counter<"component">;
export declare const runtimeEventLoopLagMs: client.Gauge<string>;
export declare const bootstrapOpenTelemetry: (config: TelemetryConfig) => {
    tracerName: string;
    enabled: boolean;
    exporterConfigured: boolean;
};
export declare const activeTraceContext: () => Pick<RequestContext, "traceId" | "spanId">;
export declare const traceContextFromHeaders: (headers: Record<string, string | string[] | undefined>) => Pick<RequestContext, "traceId" | "spanId">;
export declare const spanContextFields: (span?: Span) => Pick<RequestContext, "traceId" | "spanId">;
export declare const extractTraceContext: (carrier: Record<string, string | string[] | undefined>) => import("@opentelemetry/api").Context;
export declare const runWithSpan: <T>(name: string, attributes: Record<string, string | number | boolean>, fn: (span: Span) => Promise<T>) => Promise<T>;
export declare const statusClass: (statusCode: number) => string;
export declare const observeDependency: <T>(dependency: string, operation: string, fn: () => Promise<T>) => Promise<T>;
export declare const classifyError: (error: unknown) => ErrorCategory;
export declare const renderPrometheusMetrics: () => Promise<string>;
export declare const prometheusContentType: () => string;
export declare const probeSuccessTotal: client.Counter<"probe_type" | "probe_name">;
export declare const probeFailureTotal: client.Counter<"probe_type" | "probe_name">;
export declare const networkLatencyMs: client.Histogram<"probe_type" | "probe_name">;
export declare const networkHealthScore: client.Gauge<"probe_type">;
export * from './prometheus.js';
export * from './slo.js';
export * from './endpoint-registry.js';
export * from './opentelemetry.js';
//# sourceMappingURL=index.d.ts.map