import client from 'prom-client';
import {
  context,
  propagation,
  trace,
  SpanStatusCode,
  type Span,
  type SpanContext,
} from '@opentelemetry/api';
import { cpuUsage, memoryUsage, uptime } from 'node:process';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import type { HealthState } from '@irp/types';

export interface Metric {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp: string;
}
export type ErrorCategory =
  | 'configuration'
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'database'
  | 'network'
  | 'timeout'
  | 'dependency'
  | 'runtime'
  | 'internal';
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
export class MetricsRegistry {
  private readonly metrics: Metric[] = [];
  record(name: string, value: number, labels?: Record<string, string>): void {
    this.metrics.push({ name, value, ...(labels ? { labels } : {}), timestamp: new Date().toISOString() });
  }
  gauge(name: string, value: number, labels?: Record<string, string>): void {
    this.record(name, value, labels);
  }
  snapshot(): Metric[] {
    return [...this.metrics];
  }
  prometheus(): string {
    return this.metrics
      .map((m) => `${m.name}${m.labels ? `{${Object.entries(m.labels).map(([k, v]) => `${k}="${v.replaceAll('"', '\\"')}"`).join(',')}}` : ''} ${m.value}`)
      .join('\n');
  }
  collectRuntime(): void {
    const mem = memoryUsage();
    const cpu = cpuUsage();
    this.gauge('daemon_uptime_seconds', uptime());
    this.gauge('memory_usage_bytes', mem.rss, { type: 'rss' });
    this.gauge('cpu_usage_microseconds', cpu.user + cpu.system);
  }
}
export interface HealthStatus {
  state: HealthState;
  checks: Record<string, HealthState>;
  updatedAt: string;
  diagnostics?: Record<string, unknown>;
}
export const createHealthStatus = (checks: Record<string, HealthState>, diagnostics?: Record<string, unknown>): HealthStatus => {
  const values = Object.values(checks);
  const state: HealthState = values.includes('unhealthy')
    ? 'unhealthy'
    : values.includes('draining')
      ? 'draining'
      : values.includes('starting')
        ? 'starting'
        : values.includes('degraded')
          ? 'degraded'
          : values.includes('unknown')
            ? 'unknown'
            : 'healthy';
  return { state, checks, updatedAt: new Date().toISOString(), ...(diagnostics ? { diagnostics } : {}) };
};
export const prometheusRegister = new client.Registry();
client.collectDefaultMetrics({ register: prometheusRegister, prefix: 'irp_' });
const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
eventLoopDelay.enable();
export const httpRequestTotal = new client.Counter({
  name: 'irp_http_requests_total',
  help: 'HTTP requests completed',
  labelNames: ['method', 'route', 'status_class'],
  registers: [prometheusRegister],
});
export const httpActiveRequests = new client.Gauge({
  name: 'irp_http_active_requests',
  help: 'HTTP requests currently in flight',
  labelNames: ['method', 'route'],
  registers: [prometheusRegister],
});
export const httpRequestDuration = new client.Histogram({
  name: 'irp_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code', 'status_class'],
  registers: [prometheusRegister],
});
export const dependencyLatencyMs = new client.Histogram({
  name: 'irp_dependency_latency_ms',
  help: 'Dependency operation latency in milliseconds',
  labelNames: ['dependency', 'operation', 'status'],
  registers: [prometheusRegister],
});
export const dependencyFailuresTotal = new client.Counter({
  name: 'irp_dependency_failures_total',
  help: 'Dependency failures by dependency and operation',
  labelNames: ['dependency', 'operation', 'category'],
  registers: [prometheusRegister],
});
export const telemetryFailuresTotal = new client.Counter({
  name: 'irp_telemetry_failures_total',
  help: 'Telemetry initialization/export failures',
  labelNames: ['component'],
  registers: [prometheusRegister],
});
export const runtimeEventLoopLagMs = new client.Gauge({
  name: 'irp_runtime_event_loop_lag_ms',
  help: 'Mean event-loop delay in milliseconds',
  registers: [prometheusRegister],
  collect() {
    this.set(eventLoopDelay.mean / 1_000_000);
  },
});
export const bootstrapOpenTelemetry = (config: TelemetryConfig): { tracerName: string; enabled: boolean; exporterConfigured: boolean } => {
  if (!config.enabled) return { tracerName: config.serviceName, enabled: false, exporterConfigured: false };
  if (config.sampleRatio < 0 || config.sampleRatio > 1) throw new Error('TELEMETRY_SAMPLE_RATIO must be between 0 and 1');
  trace.getTracer(config.serviceName, config.serviceVersion);
  return { tracerName: config.serviceName, enabled: true, exporterConfigured: Boolean(config.otlpEndpoint) };
};
export const activeTraceContext = (): Pick<RequestContext, 'traceId' | 'spanId'> => {
  const spanContext = trace.getActiveSpan()?.spanContext();
  return spanContext && trace.isSpanContextValid(spanContext) ? { traceId: spanContext.traceId, spanId: spanContext.spanId } : {};
};
export const traceContextFromHeaders = (headers: Record<string, string | string[] | undefined>): Pick<RequestContext, 'traceId' | 'spanId'> => {
  const header = headers.traceparent;
  const value = Array.isArray(header) ? header[0] : header;
  const match = value?.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/i);
  return match && match[1] && match[2] ? { traceId: match[1], spanId: match[2] } : activeTraceContext();
};
export const spanContextFields = (span?: Span): Pick<RequestContext, 'traceId' | 'spanId'> => {
  const spanContext: SpanContext | undefined = span?.spanContext();
  return spanContext && trace.isSpanContextValid(spanContext) ? { traceId: spanContext.traceId, spanId: spanContext.spanId } : {};
};
export const extractTraceContext = (carrier: Record<string, string | string[] | undefined>) => propagation.extract(context.active(), carrier);
export const runWithSpan = async <T>(name: string, attributes: Record<string, string | number | boolean>, fn: (span: Span) => Promise<T>): Promise<T> =>
  trace.getTracer('irp-api').startActiveSpan(name, { attributes }, async (span) => {
    try {
      const value = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return value;
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
export const statusClass = (statusCode: number): string => `${Math.floor(statusCode / 100)}xx`;
export const observeDependency = async <T>(dependency: string, operation: string, fn: () => Promise<T>): Promise<T> => {
  const started = performance.now();
  try {
    const value = await fn();
    dependencyLatencyMs.observe({ dependency, operation, status: 'success' }, performance.now() - started);
    return value;
  } catch (error) {
    dependencyLatencyMs.observe({ dependency, operation, status: 'failure' }, performance.now() - started);
    dependencyFailuresTotal.inc({ dependency, operation, category: classifyError(error) });
    throw error;
  }
};
export const classifyError = (error: unknown): ErrorCategory => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes('config')) return 'configuration';
  if (message.includes('valid') || message.includes('schema')) return 'validation';
  if (message.includes('authenticat') || message.includes('credential') || message.includes('jwt')) return 'authentication';
  if (message.includes('forbidden') || message.includes('permission') || message.includes('authoriz')) return 'authorization';
  if (message.includes('database') || message.includes('postgres') || message.includes('sql') || message.includes('connect econnrefused')) return 'database';
  if (message.includes('timeout') || message.includes('timed out')) return 'timeout';
  if (message.includes('dns') || message.includes('tcp') || message.includes('http') || message.includes('network')) return 'network';
  return error instanceof Error ? 'internal' : 'runtime';
};
export const renderPrometheusMetrics = async (): Promise<string> => prometheusRegister.metrics();
export const prometheusContentType = (): string => prometheusRegister.contentType;
export const probeSuccessTotal = new client.Counter({ name: 'irp_probe_success_total', help: 'Successful network probe executions', labelNames: ['probe_type', 'probe_name'], registers: [prometheusRegister] });
export const probeFailureTotal = new client.Counter({ name: 'irp_probe_failure_total', help: 'Failed network probe executions', labelNames: ['probe_type', 'probe_name'], registers: [prometheusRegister] });
export const networkLatencyMs = new client.Histogram({ name: 'irp_network_latency_ms', help: 'Network probe latency in milliseconds', labelNames: ['probe_type', 'probe_name'], registers: [prometheusRegister] });
export const networkHealthScore = new client.Gauge({ name: 'irp_network_health_score', help: 'Aggregated network health score', labelNames: ['probe_type'], registers: [prometheusRegister] });
export * from './prometheus.js';
export * from './slo.js';
export * from './endpoint-registry.js';
export * from './opentelemetry.js';
