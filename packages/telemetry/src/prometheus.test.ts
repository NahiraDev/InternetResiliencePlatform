import { beforeEach, describe, expect, it } from 'vitest';
import client from 'prom-client';
import { createMetricsPlatform } from '@irp/metrics';
import {
  createDefaultPrometheusRegistry,
  createPrometheusBridge,
  renderPrometheusRegistry,
  prometheusRegistryContentType,
} from './prometheus.js';

describe('Prometheus bridge', () => {
  beforeEach(() => client.register.clear());

  it('exports counters with bounded labels and preserves increments', async () => {
    const bus = createMetricsPlatform();
    bus.define({ name: 'irp_test_requests_total', type: 'counter', description: 'Test requests' });
    const registry = new client.Registry();
    const bridge = createPrometheusBridge(bus, registry);
    const unsubscribe = bridge.subscribe();

    bus.record('irp_test_requests_total', 2, { labels: { method: 'GET' } });
    bus.record('irp_test_requests_total', 3, { labels: { method: 'GET' } });

    const text = await registry.metrics();
    expect(text).toContain('# TYPE irp_test_requests_total counter');
    expect(text).toContain('irp_test_requests_total{method="GET"} 5');
    unsubscribe();
  });

  it('exports gauges as the latest value', async () => {
    const bus = createMetricsPlatform();
    bus.define({ name: 'irp_test_health_score', type: 'gauge', description: 'Health score' });
    const registry = new client.Registry();
    const bridge = createPrometheusBridge(bus, registry);
    bridge.subscribe();

    bus.record('irp_test_health_score', 71, { labels: { region: 'local' } });
    bus.record('irp_test_health_score', 94, { labels: { region: 'local' } });

    const text = await registry.metrics();
    expect(text).toContain('# TYPE irp_test_health_score gauge');
    expect(text).toContain('irp_test_health_score{region="local"} 94');
  });

  it('rejects label schema drift for the same metric', () => {
    const bus = createMetricsPlatform();
    bus.define({ name: 'irp_test_metric', type: 'counter', description: 'Test metric' });
    const bridge = createPrometheusBridge(bus, new client.Registry());
    bridge.subscribe();
    bus.record('irp_test_metric', 1, { labels: { method: 'GET' } });
    expect(() => bus.record('irp_test_metric', 1, { labels: { route: '/health' } })).toThrow(
      'Prometheus label schema conflict',
    );
  });

  it('provides standard Prometheus registry metadata', async () => {
    const registry = createDefaultPrometheusRegistry();
    const text = await renderPrometheusRegistry(registry);
    expect(text).toContain('# TYPE irp_process_cpu_user_seconds_total counter');
    expect(prometheusRegistryContentType(registry)).toContain('text/plain');
  });
});
