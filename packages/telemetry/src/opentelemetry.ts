import { metrics } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import type { InternalMetricsBus, MetricDefinition, MetricPoint } from '@irp/metrics';

export interface OpenTelemetryConfig {
  enabled: boolean;
  serviceName: string;
  serviceVersion: string;
  environment: string;
  otlpEndpoint?: string;
  otlpTracesEndpoint?: string;
  otlpMetricsEndpoint?: string;
  otlpHeaders?: Record<string, string>;
  sampleRatio: number;
  exportIntervalMs?: number;
  exportTimeoutMs?: number;
}

export interface OpenTelemetryState {
  enabled: boolean;
  sdkStarted: boolean;
  traceExporterConfigured: boolean;
  metricExporterConfigured: boolean;
  serviceName: string;
  serviceVersion: string;
  environment: string;
  sampleRatio: number;
  exportIntervalMs: number;
  exportTimeoutMs: number;
}

export interface OpenTelemetryRuntime {
  state: OpenTelemetryState;
  forceFlush: () => Promise<void>;
  shutdown: () => Promise<void>;
  unsubscribeMetrics?: () => void;
}

const DEFAULT_EXPORT_INTERVAL_MS = 60_000;
const DEFAULT_EXPORT_TIMEOUT_MS = 30_000;
const MIN_EXPORT_INTERVAL_MS = 1_000;
const MAX_EXPORT_INTERVAL_MS = 3_600_000;
const MIN_EXPORT_TIMEOUT_MS = 1_000;
const MAX_EXPORT_TIMEOUT_MS = 120_000;

let activeRuntime: OpenTelemetryRuntime | undefined;

const validateConfig = (config: OpenTelemetryConfig): void => {
  if (!config.serviceName.trim()) throw new Error('OpenTelemetry serviceName is required');
  if (!config.serviceVersion.trim()) throw new Error('OpenTelemetry serviceVersion is required');
  if (!Number.isFinite(config.sampleRatio) || config.sampleRatio < 0 || config.sampleRatio > 1)
    throw new Error('TELEMETRY_SAMPLE_RATIO must be between 0 and 1');
  const interval = config.exportIntervalMs ?? DEFAULT_EXPORT_INTERVAL_MS;
  const timeout = config.exportTimeoutMs ?? DEFAULT_EXPORT_TIMEOUT_MS;
  if (!Number.isInteger(interval) || interval < MIN_EXPORT_INTERVAL_MS || interval > MAX_EXPORT_INTERVAL_MS)
    throw new Error(`OTEL_EXPORT_INTERVAL_MS must be between ${MIN_EXPORT_INTERVAL_MS} and ${MAX_EXPORT_INTERVAL_MS}`);
  if (!Number.isInteger(timeout) || timeout < MIN_EXPORT_TIMEOUT_MS || timeout > MAX_EXPORT_TIMEOUT_MS)
    throw new Error(`OTEL_EXPORT_TIMEOUT_MS must be between ${MIN_EXPORT_TIMEOUT_MS} and ${MAX_EXPORT_TIMEOUT_MS}`);
  if (timeout >= interval)
    throw new Error('OTEL_EXPORT_TIMEOUT_MS must be smaller than OTEL_EXPORT_INTERVAL_MS');
}

const withSignalPath = (endpoint: string | undefined, signal: 'traces' | 'metrics'): string | undefined => {
  if (!endpoint) return undefined;
  const normalized = endpoint.replace(/\/+$/, '');
  return normalized.endsWith(`/v1/${signal}`) ? normalized : `${normalized}/v1/${signal}`;
};

const createMetricExporter = (config: OpenTelemetryConfig): OTLPMetricExporter | undefined => {
  const endpoint = withSignalPath(config.otlpMetricsEndpoint ?? config.otlpEndpoint, 'metrics');
  if (!endpoint) return undefined;
  return new OTLPMetricExporter({
    url: endpoint,
    headers: config.otlpHeaders,
    timeoutMillis: config.exportTimeoutMs ?? DEFAULT_EXPORT_TIMEOUT_MS,
  });
};

const createTraceExporter = (config: OpenTelemetryConfig): OTLPTraceExporter | undefined => {
  const endpoint = withSignalPath(config.otlpTracesEndpoint ?? config.otlpEndpoint, 'traces');
  if (!endpoint) return undefined;
  return new OTLPTraceExporter({
    url: endpoint,
    headers: config.otlpHeaders,
    timeoutMillis: config.exportTimeoutMs ?? DEFAULT_EXPORT_TIMEOUT_MS,
  });
};

class MetricsBridge {
  private readonly instruments = new Map<string, ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>>();
  private readonly meter = metrics.getMeter('irp.internal-metrics', '0.1.0');

  constructor(private readonly bus: InternalMetricsBus) {}

  subscribe(): () => void {
    for (const definition of this.bus.registry.list()) this.ensureInstrument(definition);
    return this.bus.subscribe((point) => this.record(point));
  }

  private ensureInstrument(definition: MetricDefinition) {
    const existing = this.instruments.get(definition.name);
    if (existing) return existing;
    const instrument =
      definition.type === 'counter'
        ? this.meter.createCounter(definition.name, {
            description: definition.description,
            unit: definition.unit,
          })
        : definition.type === 'gauge'
          ? this.meter.createUpDownCounter(definition.name, {
              description: definition.description,
              unit: definition.unit,
            })
          : this.meter.createHistogram(definition.name, {
              description: definition.description,
              unit: definition.unit,
            });
    this.instruments.set(definition.name, instrument);
    return instrument;
  }

  private record(point: MetricPoint): void {
    const definition = this.bus.registry.get(point.name);
    if (!definition) return;
    const instrument = this.ensureInstrument(definition);
    if (definition.type === 'counter') instrument.add(point.value, point.labels);
    else if (definition.type === 'gauge') instrument.add(point.value, point.labels);
    else instrument.record(point.value, point.labels);
  }
}

export const initializeOpenTelemetry = (
  config: OpenTelemetryConfig,
  metricsBus?: InternalMetricsBus,
): OpenTelemetryRuntime => {
  validateConfig(config);
  if (!config.enabled) {
    return {
      state: {
        enabled: false,
        sdkStarted: false,
        traceExporterConfigured: false,
        metricExporterConfigured: false,
        serviceName: config.serviceName,
        serviceVersion: config.serviceVersion,
        environment: config.environment,
        sampleRatio: config.sampleRatio,
        exportIntervalMs: config.exportIntervalMs ?? DEFAULT_EXPORT_INTERVAL_MS,
        exportTimeoutMs: config.exportTimeoutMs ?? DEFAULT_EXPORT_TIMEOUT_MS,
      },
      forceFlush: async () => undefined,
      shutdown: async () => undefined,
    };
  }

  if (activeRuntime) return activeRuntime;

  const traceExporter = createTraceExporter(config);
  const metricExporter = createMetricExporter(config);
  const exportIntervalMs = config.exportIntervalMs ?? DEFAULT_EXPORT_INTERVAL_MS;
  const exportTimeoutMs = config.exportTimeoutMs ?? DEFAULT_EXPORT_TIMEOUT_MS;
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion,
    'deployment.environment.name': config.environment,
  });

  const sdk = new NodeSDK({
    resource,
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(config.sampleRatio) }),
    ...(traceExporter ? { traceExporter } : {}),
    ...(metricExporter
      ? {
          metricReader: new PeriodicExportingMetricReader({
            exporter: metricExporter,
            exportIntervalMillis: exportIntervalMs,
            exportTimeoutMillis: exportTimeoutMs,
          }),
        }
      : {}),
  });

  sdk.start();
  const bridge = metricsBus && metricExporter ? new MetricsBridge(metricsBus) : undefined;
  const unsubscribeMetrics = bridge?.subscribe();
  const state: OpenTelemetryState = {
    enabled: true,
    sdkStarted: true,
    traceExporterConfigured: Boolean(traceExporter),
    metricExporterConfigured: Boolean(metricExporter),
    serviceName: config.serviceName,
    serviceVersion: config.serviceVersion,
    environment: config.environment,
    sampleRatio: config.sampleRatio,
    exportIntervalMs,
    exportTimeoutMs,
  };

  const runtime: OpenTelemetryRuntime = {
    state,
    forceFlush: async () => {
      await sdk.shutdown();
      activeRuntime = undefined;
    },
    shutdown: async () => {
      unsubscribeMetrics?.();
      await sdk.shutdown();
      activeRuntime = undefined;
    },
    ...(unsubscribeMetrics ? { unsubscribeMetrics } : {}),
  };
  activeRuntime = runtime;
  return runtime;
};

export const getOpenTelemetryRuntime = (): OpenTelemetryRuntime | undefined => activeRuntime;
