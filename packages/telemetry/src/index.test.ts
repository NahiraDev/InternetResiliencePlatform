import { describe, expect, it } from 'vitest';
import { MetricsRegistry, createHealthStatus } from './index.js';

describe('telemetry metrics and health', () => {
  it('records immutable metric snapshots and renders labels for prometheus text', () => {
    const metrics = new MetricsRegistry();
    metrics.gauge('network_health_score', 98, { provider: 'loopback' });
    const snapshot = metrics.snapshot();
    snapshot.length = 0;

    expect(metrics.snapshot()).toHaveLength(1);
    expect(metrics.prometheus()).toContain('network_health_score{provider="loopback"} 98');
  });

  it('aggregates health as unhealthy before degraded before healthy', () => {
    expect(createHealthStatus({ api: 'healthy', network: 'healthy' }).state).toBe('healthy');
    expect(createHealthStatus({ api: 'healthy', network: 'degraded' }).state).toBe('degraded');
    expect(
      createHealthStatus({ api: 'healthy', network: 'unhealthy', dns: 'degraded' }).state,
    ).toBe('unhealthy');
  });
});
