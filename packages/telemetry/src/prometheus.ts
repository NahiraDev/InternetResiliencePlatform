import client, {
  type Counter,
  type Gauge,
  type Histogram,
  type Registry,
} from 'prom-client';
import type { InternalMetricsBus, MetricDefinition, MetricPoint } from '@irp/metrics';

export interface PrometheusBridge {
  readonly registry: Registry;
  subscribe(): () => void;
  registerDefinition(definition: MetricDefinition): void;
  record(point: MetricPoint): void;
}

type Metric = Counter<string> | Gauge<string> | Histogram<string>;

const sanitizeHelp = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim() || 'InternetResiliencePlatform metric';

const safeName = (name: string): string => {
  if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name)) throw new Error(`Invalid Prometheus metric name: ${name}`);
  return name;
};

const labelNames = (point: MetricPoint): string[] => Object.keys(point.labels).sort();

const createMetric = (registry: Registry, definition: MetricDefinition): Metric => {
  const name = safeName(definition.name);
  const help = sanitizeHelp(definition.description);
  const labels = definition.type === 'counter' || definition.type === 'gauge' || definition.type === 'histogram'
    ? [] as string[]
    : [] as string[];

  // Labels are discovered from the first point for each metric. The Metrics Bus
  // already bounds and validates label names/values; registering a metric with
  // zero labels here is intentionally deferred until the first observation.
  return labels.length === 0
    ? definition.type === 'counter'
      ? new client.Counter({ name, help, registers: [registry] })
      : definition.type === 'gauge'
        ? new client.Gauge({ name, help, registers: [registry] })
        : new client.Histogram({ name, help, registers: [registry] })
    : definition.type === 'counter'
      ? new client.Counter({ name, help, labelNames: labels, registers: [registry] })
      : definition.type === 'gauge'
        ? new client.Gauge({ name, help, labelNames: labels, registers: [registry] })
        : new client.Histogram({ name, help, labelNames: labels, registers: [registry] });
};

export const createPrometheusBridge = (
  bus: InternalMetricsBus,
  registry: Registry = new client.Registry(),
): PrometheusBridge => {
  const metrics = new Map<string, Metric>();
  const metricLabels = new Map<string, string[]>();
  const cumulativeCounterKeys = new Set<string>();
  const gaugeValues = new Map<string, number>();

  const ensureMetric = (definition: MetricDefinition, point?: MetricPoint): Metric => {
    const existing = metrics.get(definition.name);
    if (existing) return existing;

    const labels = point ? labelNames(point) : [];
    if (metricLabels.has(definition.name)) {
      const expected = metricLabels.get(definition.name)!;
      if (JSON.stringify(expected) !== JSON.stringify(labels)) {
        throw new Error(`Prometheus label schema conflict: ${definition.name}`);
      }
    } else {
      metricLabels.set(definition.name, labels);
    }

    if (labels.length === 0) {
      const metric = createMetric(registry, definition);
      metrics.set(definition.name, metric);
      return metric;
    }

    const name = safeName(definition.name);
    const help = sanitizeHelp(definition.description);
    const metric = definition.type === 'counter'
      ? new client.Counter({ name, help, labelNames: labels, registers: [registry] })
      : definition.type === 'gauge'
        ? new client.Gauge({ name, help, labelNames: labels, registers: [registry] })
        : new client.Histogram({ name, help, labelNames: labels, registers: [registry] });
    metrics.set(definition.name, metric);
    return metric;
  };

  const bridge: PrometheusBridge = {
    registry,
    registerDefinition(definition) {
      if (!metrics.has(definition.name) && !metricLabels.has(definition.name)) {
        metricLabels.set(definition.name, []);
      }
      // Instrument creation is lazy because labels are part of the runtime contract.
    },
    record(point) {
      const definition = bus.registry.get(point.name);
      if (!definition) throw new Error(`Metric is not registered: ${point.name}`);
      const metric = ensureMetric(definition, point) as Counter | Gauge | Histogram;
      const labels = point.labels;
      const key = `${point.name}|${JSON.stringify(labels)}`;

      if (definition.type === 'counter') {
        cumulativeCounterKeys.add(key);
        metric.inc(labels, point.value);
      } else if (definition.type === 'gauge') {
        gaugeValues.set(key, point.value);
        metric.set(labels, point.value);
      } else {
        metric.observe(labels, point.value);
      }
    },
    subscribe() {
      for (const definition of bus.registry.list()) bridge.registerDefinition(definition);
      return bus.subscribe((point) => bridge.record(point));
    },
  };

  return bridge;
};

export const createDefaultPrometheusRegistry = (): Registry => {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry, prefix: 'irp_' });
  return registry;
};

export const renderPrometheusRegistry = async (registry: Registry): Promise<string> => registry.metrics();
export const prometheusRegistryContentType = (registry: Registry): string => registry.contentType;
