export type MetricType = 'counter' | 'gauge' | 'histogram';

export interface MetricDefinition {
  readonly name: string;
  readonly type: MetricType;
  readonly description: string;
  readonly unit?: string;
}

export interface MetricPoint {
  readonly name: string;
  readonly type: MetricType;
  readonly value: number;
  readonly timestamp: number;
  readonly labels: Readonly<Record<string, string>>;
}

export interface RetentionPolicy {
  readonly maxSamples: number;
  readonly maxAgeMs: number;
}

export interface MetricsSnapshot {
  readonly generatedAt: number;
  readonly points: readonly MetricPoint[];
  readonly definitions: readonly MetricDefinition[];
}

export interface MetricsQuery {
  readonly name?: string;
  readonly type?: MetricType;
  readonly from?: number;
  readonly to?: number;
  readonly labels?: Readonly<Record<string, string>>;
  readonly limit?: number;
}

export type MetricsListener = (point: MetricPoint) => void;

const METRIC_NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const DEFAULT_RETENTION: RetentionPolicy = { maxSamples: 10_000, maxAgeMs: 24 * 60 * 60 * 1000 };
const MAX_LABELS = 16;
const MAX_LABEL_VALUE_LENGTH = 256;

const assertFiniteTimestamp = (timestamp: number) => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) throw new Error('Metric timestamp must be a positive finite number');
};

const assertLabels = (labels: Readonly<Record<string, string>>) => {
  const entries = Object.entries(labels);
  if (entries.length > MAX_LABELS) throw new Error(`Metric labels exceed the maximum of ${MAX_LABELS}`);
  for (const [name, value] of entries) {
    if (!LABEL_NAME.test(name)) throw new Error(`Invalid metric label name: ${name}`);
    if (value.length > MAX_LABEL_VALUE_LENGTH) throw new Error(`Metric label value exceeds ${MAX_LABEL_VALUE_LENGTH} characters: ${name}`);
  }
};

const normalizeLabels = (labels?: Readonly<Record<string, string>>) => {
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(labels ?? {})) normalized[name] = String(value);
  assertLabels(normalized);
  return Object.freeze(normalized);
};

const sameLabels = (expected: Readonly<Record<string, string>> | undefined, actual: Readonly<Record<string, string>>) => {
  if (!expected) return true;
  const expectedEntries = Object.entries(expected);
  return expectedEntries.length <= Object.keys(actual).length && expectedEntries.every(([key, value]) => actual[key] === value);
};

const clonePoint = (point: MetricPoint): MetricPoint => ({
  ...point,
  labels: Object.freeze({ ...point.labels }),
});

export class MetricRegistry {
  private readonly definitions = new Map<string, MetricDefinition>();

  register(definition: MetricDefinition): MetricDefinition {
    if (!METRIC_NAME.test(definition.name)) throw new Error(`Invalid metric name: ${definition.name}`);
    if (!definition.description.trim()) throw new Error(`Metric description is required: ${definition.name}`);
    const existing = this.definitions.get(definition.name);
    if (existing) {
      if (existing.type !== definition.type || existing.unit !== definition.unit || existing.description !== definition.description) {
        throw new Error(`Metric definition conflict: ${definition.name}`);
      }
      return existing;
    }
    const frozen = Object.freeze({ ...definition });
    this.definitions.set(definition.name, frozen);
    return frozen;
  }

  get(name: string): MetricDefinition | undefined {
    return this.definitions.get(name);
  }

  list(): MetricDefinition[] {
    return [...this.definitions.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}

export class RetainedMetricStore {
  private points: MetricPoint[] = [];
  private policy: RetentionPolicy;

  constructor(policy: Partial<RetentionPolicy> = {}) {
    this.policy = this.normalizePolicy(policy);
  }

  setRetentionPolicy(policy: RetentionPolicy): void {
    this.policy = this.normalizePolicy(policy);
    this.prune(Date.now());
  }

  getRetentionPolicy(): RetentionPolicy {
    return { ...this.policy };
  }

  append(point: MetricPoint): void {
    this.points.push(clonePoint(point));
    this.prune(point.timestamp);
  }

  query(query: MetricsQuery = {}): MetricPoint[] {
    const from = query.from ?? Number.NEGATIVE_INFINITY;
    const to = query.to ?? Number.POSITIVE_INFINITY;
    if (from > to) throw new Error('Metrics query from must be <= to');
    const limit = query.limit === undefined ? this.policy.maxSamples : Math.min(query.limit, this.policy.maxSamples);
    if (!Number.isInteger(limit) || limit <= 0) throw new Error('Metrics query limit must be a positive integer');
    return this.points
      .filter((point) => point.timestamp >= from && point.timestamp <= to)
      .filter((point) => !query.name || point.name === query.name)
      .filter((point) => !query.type || point.type === query.type)
      .filter((point) => sameLabels(query.labels, point.labels))
      .slice(-limit)
      .map(clonePoint);
  }

  snapshot(): MetricPoint[] {
    return this.points.map(clonePoint);
  }

  size(): number {
    return this.points.length;
  }

  private prune(now: number): void {
    const cutoff = now - this.policy.maxAgeMs;
    const firstFresh = this.points.findIndex((point) => point.timestamp >= cutoff);
    if (firstFresh === -1) {
      this.points = [];
      return;
    }
    if (firstFresh > 0) this.points = this.points.slice(firstFresh);
    if (this.points.length > this.policy.maxSamples) this.points = this.points.slice(-this.policy.maxSamples);
  }

  private normalizePolicy(policy: Partial<RetentionPolicy>): RetentionPolicy {
    const maxSamples = policy.maxSamples ?? DEFAULT_RETENTION.maxSamples;
    const maxAgeMs = policy.maxAgeMs ?? DEFAULT_RETENTION.maxAgeMs;
    if (!Number.isInteger(maxSamples) || maxSamples < 1) throw new Error('Retention maxSamples must be a positive integer');
    if (!Number.isFinite(maxAgeMs) || maxAgeMs < 1) throw new Error('Retention maxAgeMs must be a positive finite number');
    return { maxSamples, maxAgeMs };
  }
}

export class InternalMetricsBus {
  readonly registry: MetricRegistry;
  readonly store: RetainedMetricStore;
  private readonly listeners = new Set<MetricsListener>();

  constructor(options: { retention?: Partial<RetentionPolicy>; registry?: MetricRegistry } = {}) {
    this.registry = options.registry ?? new MetricRegistry();
    this.store = new RetainedMetricStore(options.retention);
  }

  define(definition: MetricDefinition): MetricDefinition {
    return this.registry.register(definition);
  }

  record(
    definitionOrName: MetricDefinition | string,
    value: number,
    options: { timestamp?: number; labels?: Readonly<Record<string, string>> } = {},
  ): MetricPoint {
    const definition = typeof definitionOrName === 'string' ? this.registry.get(definitionOrName) : this.registry.register(definitionOrName);
    if (!definition) throw new Error(`Metric is not registered: ${definitionOrName}`);
    if (!Number.isFinite(value)) throw new Error(`Metric value must be finite: ${definition.name}`);
    if (definition.type === 'counter' && value < 0) throw new Error(`Counter values cannot be negative: ${definition.name}`);
    if (definition.type === 'histogram' && value < 0) throw new Error(`Histogram observations cannot be negative: ${definition.name}`);
    const timestamp = options.timestamp ?? Date.now();
    assertFiniteTimestamp(timestamp);
    const point: MetricPoint = Object.freeze({
      name: definition.name,
      type: definition.type,
      value,
      timestamp,
      labels: normalizeLabels(options.labels),
    });
    this.store.append(point);
    for (const listener of this.listeners) listener(clonePoint(point));
    return clonePoint(point);
  }

  subscribe(listener: MetricsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  query(query: MetricsQuery = {}): MetricPoint[] {
    return this.store.query(query);
  }

  snapshot(): MetricsSnapshot {
    return {
      generatedAt: Date.now(),
      points: this.store.snapshot(),
      definitions: this.registry.list(),
    };
  }

  clear(): void {
    const policy = this.store.getRetentionPolicy();
    this.store.setRetentionPolicy({ maxSamples: policy.maxSamples, maxAgeMs: 1 });
    this.store.setRetentionPolicy(policy);
  }
}

export const createMetricsPlatform = (options: { retention?: Partial<RetentionPolicy> } = {}) => new InternalMetricsBus(options);
