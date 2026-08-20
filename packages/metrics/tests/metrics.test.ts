import { describe, expect, it, vi } from 'vitest';
import {
  InternalMetricsBus,
  MetricRegistry,
  RetainedMetricStore,
  createMetricsPlatform,
} from '../src/index.js';

describe('MetricRegistry', () => {
  it('registers and returns deterministic definitions', () => {
    const registry = new MetricRegistry();
    registry.register({ name: 'irp_test_total', type: 'counter', description: 'Test counter' });
    registry.register({ name: 'irp_latency_ms', type: 'histogram', description: 'Latency', unit: 'ms' });

    expect(registry.list().map((metric) => metric.name)).toEqual(['irp_latency_ms', 'irp_test_total']);
    expect(registry.get('irp_test_total')?.type).toBe('counter');
  });

  it('rejects conflicting metric definitions', () => {
    const registry = new MetricRegistry();
    registry.register({ name: 'irp_conflict', type: 'gauge', description: 'Original' });
    expect(() => registry.register({ name: 'irp_conflict', type: 'counter', description: 'Changed' })).toThrow(
      'Metric definition conflict',
    );
  });
});

describe('RetainedMetricStore', () => {
  it('keeps only the configured sample count', () => {
    const store = new RetainedMetricStore({ maxSamples: 2, maxAgeMs: 60_000 });
    store.append({ name: 'irp_value', type: 'gauge', value: 1, timestamp: 1_000, labels: {} });
    store.append({ name: 'irp_value', type: 'gauge', value: 2, timestamp: 2_000, labels: {} });
    store.append({ name: 'irp_value', type: 'gauge', value: 3, timestamp: 3_000, labels: {} });

    expect(store.query()).toHaveLength(2);
    expect(store.query().map((point) => point.value)).toEqual([2, 3]);
  });

  it('removes expired points', () => {
    const store = new RetainedMetricStore({ maxSamples: 10, maxAgeMs: 1_000 });
    store.append({ name: 'irp_value', type: 'gauge', value: 1, timestamp: 1_000, labels: {} });
    store.append({ name: 'irp_value', type: 'gauge', value: 2, timestamp: 3_000, labels: {} });

    expect(store.snapshot().map((point) => point.value)).toEqual([2]);
  });
});

describe('InternalMetricsBus', () => {
  it('defines, records, queries, and publishes metric points', () => {
    const bus = createMetricsPlatform({ retention: { maxSamples: 10, maxAgeMs: 60_000 } });
    bus.define({ name: 'irp_requests_total', type: 'counter', description: 'Requests' });
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);

    const point = bus.record('irp_requests_total', 1, {
      timestamp: 10_000,
      labels: { method: 'GET' },
    });

    expect(point.labels).toEqual({ method: 'GET' });
    expect(bus.query({ name: 'irp_requests_total', labels: { method: 'GET' } })).toHaveLength(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ value: 1, name: 'irp_requests_total' }));

    unsubscribe();
    bus.record('irp_requests_total', 2, { timestamp: 11_000 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid values, names, timestamps, and undeclared metrics', () => {
    const bus = new InternalMetricsBus();
    expect(() => bus.define({ name: 'bad-name', type: 'gauge', description: 'bad' })).toThrow('Invalid metric name');
    bus.define({ name: 'irp_counter_total', type: 'counter', description: 'Counter' });
    expect(() => bus.record('irp_counter_total', -1)).toThrow('Counter values cannot be negative');
    expect(() => bus.record('irp_counter_total', Number.NaN)).toThrow('Metric value must be finite');
    expect(() => bus.record('irp_counter_total', 1, { timestamp: 0 })).toThrow('Metric timestamp');
    expect(() => bus.record('missing_metric', 1)).toThrow('Metric is not registered');
  });

  it('enforces label cardinality limits', () => {
    const bus = new InternalMetricsBus();
    bus.define({ name: 'irp_cardinality', type: 'gauge', description: 'Cardinality test' });
    const labels = Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`label_${index}`, 'x']));
    expect(() => bus.record('irp_cardinality', 1, { labels })).toThrow('maximum of 16');
  });

  it('returns a stable snapshot with definitions', () => {
    const bus = new InternalMetricsBus();
    bus.define({ name: 'irp_gauge', type: 'gauge', description: 'Gauge' });
    bus.record('irp_gauge', 5);
    const snapshot = bus.snapshot();

    expect(snapshot.points).toHaveLength(1);
    expect(snapshot.definitions).toEqual([
      { name: 'irp_gauge', type: 'gauge', description: 'Gauge' },
    ]);
    expect(snapshot.generatedAt).toBeGreaterThan(0);
  });
});
