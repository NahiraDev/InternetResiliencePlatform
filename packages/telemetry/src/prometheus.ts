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

const sanitizeHelp = (value: string): string =>
  value.replace(/[\r\n]+/g, ' ').trim() || 'InternetResiliencePlatform metric';

const safeName = (name: string): string => {
  if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name))
    throw new Error(`Invalid Prometheus metric name: ${name}`);
  return name;
};

const labelsForPoint = (point: MetricPoint): string[] => Object.keys(point.labels).sort();
const sameLabelSchema = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const metricType = (metric: Metric): string => metric.constructor.name;

const createMetric = (
  registry: Registry,
  definition: MetricDefinition,
  labels: string[],
): Metric => {
  const name = safeName(definition.name);
  const help = sanitizeHelp(definition.description);
  if (definition.type === 'counter')
    return new client.Counter({ name, help, labelNames: labels, registers: [registry] });
  if (definition.type === 'gauge')
    return new client.Gauge({ name, help, labelNames: labels, registers: [registry] });
  return new client.Histogram({ name, help, labelNames: labels, registers: [registry] });
};

export const createPrometheusBridge = (
  bus: InternalMetricsBus,
  registry: Registry = new client.Registry(),
): PrometheusBridge => {
  const metrics = new Map<string, Metric>();
  const metricLabels = new Map<string, string[]>();

  const ensureMetric = (definition: MetricDefinition, point: MetricPoint): Metric => {
    const labels = labelsForPoint(point);
    const existingLabels = metricLabels.get(definition.name);
    if (existingLabels && !sameLabelSchema(existingLabels, labels)) {
      throw new Error(`Prometheus label schema conflict: ${definition.name}`);
    }
    const existing = metrics.get(definition.name);
    if (existing) return existing;

    const registered = registry.getSingleMetric(definition.name) as Metric | undefined;
    if (registered) {
      metrics.set(definition.name, registered);
      metricLabels.set(definition.name, labels);
      const expectedType = definition.type === 'histogram' ? 'Histogram' : definition.type === 'counter' ? 'Counter' : 'Gauge';
      if (metricType(registered) !== expectedType)
        throw new Error(`Prometheus metric type conflict: ${definition.name}`);
      return registered;
    }

    metricLabels.set(definition.name, labels);
    const metric = createMetric(registry, definition, labels);
    metrics.set(definition.name, metric);
    return metric;
  };

  const bridge: PrometheusBridge = {
    registry,
    registerDefinition(definition) {
      safeName(definition.name);
      sanitizeHelp(definition.description);
    },
    record(point) {
      const definition = bus.registry.get(point.name);
      if (!definition) throw new Error(`Metric is not registered: ${point.name}`);
      const metric = ensureMetric(definition, point);
      if (definition.type === 'counter') metric.inc(point.labels, point.value);
      else if (definition.type === 'gauge') metric.set(point.labels, point.value);
      else metric.observe(point.labels, point.value);
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
