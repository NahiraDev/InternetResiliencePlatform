import type { HealthState } from '@irp/types';
export interface Metric { name: string; value: number; labels?: Record<string, string>; timestamp: string; }
export class MetricsRegistry { private readonly metrics: Metric[] = []; record(name: string, value: number, labels?: Record<string, string>): void { this.metrics.push({ name, value, ...(labels ? { labels } : {}), timestamp: new Date().toISOString() }); } snapshot(): Metric[] { return [...this.metrics]; } }
export interface HealthStatus { state: HealthState; checks: Record<string, HealthState>; updatedAt: string; }
export const createHealthStatus = (checks: Record<string, HealthState>): HealthStatus => ({ state: Object.values(checks).includes('unhealthy') ? 'unhealthy' : Object.values(checks).includes('degraded') ? 'degraded' : 'healthy', checks, updatedAt: new Date().toISOString() });
