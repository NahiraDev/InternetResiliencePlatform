import client from 'prom-client';
import { trace } from '@opentelemetry/api';
import { cpuUsage, memoryUsage, uptime } from 'node:process';
import type { HealthState } from '@irp/types';
export interface Metric { name: string; value: number; labels?: Record<string, string>; timestamp: string; }
export class MetricsRegistry { private readonly metrics: Metric[] = []; record(name: string, value: number, labels?: Record<string, string>): void { this.metrics.push({ name, value, ...(labels ? { labels } : {}), timestamp: new Date().toISOString() }); } gauge(name: string, value: number, labels?: Record<string, string>): void { this.record(name, value, labels); } snapshot(): Metric[] { return [...this.metrics]; } prometheus(): string { return this.metrics.map((m) => `${m.name}${m.labels ? `{${Object.entries(m.labels).map(([k, v]) => `${k}="${v}"`).join(',')}}` : ''} ${m.value}`).join('\n'); } collectRuntime(): void { const mem = memoryUsage(); const cpu = cpuUsage(); this.gauge('daemon_uptime_seconds', uptime()); this.gauge('memory_usage_bytes', mem.rss, { type: 'rss' }); this.gauge('cpu_usage_microseconds', cpu.user + cpu.system); } }
export interface HealthStatus { state: HealthState; checks: Record<string, HealthState>; updatedAt: string; }
export const createHealthStatus = (checks: Record<string, HealthState>): HealthStatus => ({ state: Object.values(checks).includes('unhealthy') ? 'unhealthy' : Object.values(checks).includes('degraded') ? 'degraded' : 'healthy', checks, updatedAt: new Date().toISOString() });
export const prometheusRegister = new client.Registry();
client.collectDefaultMetrics({ register: prometheusRegister });
export const httpRequestDuration = new client.Histogram({ name: 'irp_http_request_duration_seconds', help: 'HTTP request duration in seconds', labelNames: ['method', 'route', 'status_code'], registers: [prometheusRegister] });
export const bootstrapOpenTelemetry = (serviceName: string): void => { trace.getTracer(serviceName); };
export const renderPrometheusMetrics = async (): Promise<string> => prometheusRegister.metrics();

export const probeSuccessTotal = new client.Counter({ name: 'probe_success_total', help: 'Successful network probe executions', labelNames: ['probe_type', 'probe_name'], registers: [prometheusRegister] });
export const probeFailureTotal = new client.Counter({ name: 'probe_failure_total', help: 'Failed network probe executions', labelNames: ['probe_type', 'probe_name'], registers: [prometheusRegister] });
export const networkLatencyMs = new client.Histogram({ name: 'network_latency_ms', help: 'Network probe latency in milliseconds', labelNames: ['probe_type', 'probe_name'], registers: [prometheusRegister] });
export const networkHealthScore = new client.Gauge({ name: 'network_health_score', help: 'Aggregated network health score', registers: [prometheusRegister] });
