import { describe, expect, it } from 'vitest';
import {
  MetricsRegistry,
  bootstrapOpenTelemetry,
  classifyError,
  createHealthStatus,
  observeDependency,
  renderPrometheusMetrics,
  statusClass,
} from './index.js';

describe('telemetry metrics and health', () => {
  it('records immutable metric snapshots and renders labels for prometheus text', () => {
    const metrics = new MetricsRegistry();
    metrics.gauge('network_health_score', 98, { provider: 'loopback' });
    const snapshot = metrics.snapshot();
    snapshot.length = 0;
    expect(metrics.snapshot()).toHaveLength(1);
    expect(metrics.prometheus()).toContain('network_health_score{provider="loopback"} 98');
  });
  it('aggregates health and carries safe diagnostics', () => {
    const health = createHealthStatus(
      { api: 'healthy', network: 'degraded' },
      { service: 'irp-api' },
    );
    expect(health.state).toBe('degraded');
    expect(health.diagnostics).toEqual({ service: 'irp-api' });
  });
  it('classifies operational errors and validates tracing config', () => {
    expect(classifyError(new Error('database connection failed'))).toBe('database');
    expect(classifyError(new Error('request timed out'))).toBe('timeout');
    expect(() =>
      bootstrapOpenTelemetry({
        enabled: true,
        serviceName: 'irp-api',
        serviceVersion: '0.1.0',
        environment: 'test',
        sampleRatio: 2,
        prometheus: true,
      }),
    ).toThrow('TELEMETRY_SAMPLE_RATIO');
  });
  it('observes dependency success and failure without swallowing exporter-independent errors', async () => {
    await expect(observeDependency('postgresql', 'readiness', async () => 'ok')).resolves.toBe(
      'ok',
    );
    await expect(
      observeDependency('postgresql', 'readiness', async () => {
        throw new Error('database unavailable');
      }),
    ).rejects.toThrow('database unavailable');
    const metrics = await renderPrometheusMetrics();
    expect(metrics).toContain('irp_dependency_latency_ms');
    expect(metrics).toContain('irp_dependency_failures_total');
  });
  it('uses bounded status-class labels', () => {
    expect(statusClass(204)).toBe('2xx');
    expect(statusClass(503)).toBe('5xx');
  });
});
