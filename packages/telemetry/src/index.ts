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
