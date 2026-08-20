import { describe, expect, it } from 'vitest';
import { createMetricsPlatform } from '@irp/metrics';
import { getOpenTelemetryRuntime, initializeOpenTelemetry } from './opentelemetry.js';

describe('OpenTelemetry runtime', () => {
  it('is a safe no-op when disabled', async () => {
    const runtime = initializeOpenTelemetry({
      enabled: false,
      serviceName: 'irp-test',
      serviceVersion: '0.1.0',
      environment: 'test',
      sampleRatio: 0.1,
    });
    expect(runtime.state.enabled).toBe(false);
    expect(runtime.state.sdkStarted).toBe(false);
    await runtime.shutdown();
  });

  it('rejects invalid sampling and export timing configuration', () => {
    expect(() =>
      initializeOpenTelemetry({
        enabled: true,
        serviceName: 'irp-test',
        serviceVersion: '0.1.0',
        environment: 'test',
        sampleRatio: 1.1,
      }),
    ).toThrow('TELEMETRY_SAMPLE_RATIO');

    expect(() =>
      initializeOpenTelemetry({
        enabled: true,
        serviceName: 'irp-test',
        serviceVersion: '0.1.0',
        environment: 'test',
        sampleRatio: 0.1,
        exportIntervalMs: 1_000,
        exportTimeoutMs: 1_000,
      }),
    ).toThrow('OTEL_EXPORT_TIMEOUT_MS');
  });

  it('initializes the real SDK without creating an implicit exporter', async () => {
    expect(getOpenTelemetryRuntime()).toBeUndefined();
    const runtime = initializeOpenTelemetry({
      enabled: true,
      serviceName: 'irp-test',
      serviceVersion: '0.1.0',
      environment: 'test',
      sampleRatio: 0.25,
    });
    expect(runtime.state.sdkStarted).toBe(true);
    expect(runtime.state.traceExporterConfigured).toBe(false);
    expect(runtime.state.metricExporterConfigured).toBe(false);
    expect(getOpenTelemetryRuntime()).toBe(runtime);

    const metrics = createMetricsPlatform();
    metrics.define({
      name: 'irp_test_metric',
      type: 'counter',
      description: 'Test metric',
    });
    metrics.record('irp_test_metric', 1);
    expect(metrics.query({ name: 'irp_test_metric' })).toHaveLength(1);

    await runtime.shutdown();
    expect(getOpenTelemetryRuntime()).toBeUndefined();
  });
});
