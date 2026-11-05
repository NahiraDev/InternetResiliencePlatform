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
export declare class MetricRegistry {
    private readonly definitions;
    register(definition: MetricDefinition): MetricDefinition;
    get(name: string): MetricDefinition | undefined;
    list(): MetricDefinition[];
}
export declare class RetainedMetricStore {
    private points;
    private policy;
    constructor(policy?: Partial<RetentionPolicy>);
    setRetentionPolicy(policy: RetentionPolicy): void;
    getRetentionPolicy(): RetentionPolicy;
    append(point: MetricPoint): void;
    clear(): void;
    query(query?: MetricsQuery): MetricPoint[];
    snapshot(): MetricPoint[];
    size(): number;
    private prune;
    private normalizePolicy;
}
export declare class InternalMetricsBus {
    readonly registry: MetricRegistry;
    readonly store: RetainedMetricStore;
    private readonly listeners;
    constructor(options?: {
        retention?: Partial<RetentionPolicy>;
        registry?: MetricRegistry;
    });
    define(definition: MetricDefinition): MetricDefinition;
    record(definitionOrName: MetricDefinition | string, value: number, options?: {
        timestamp?: number;
        labels?: Readonly<Record<string, string>>;
    }): MetricPoint;
    subscribe(listener: MetricsListener): () => void;
    query(query?: MetricsQuery): MetricPoint[];
    snapshot(): MetricsSnapshot;
    clear(): void;
}
export declare const createMetricsPlatform: (options?: {
    retention?: Partial<RetentionPolicy>;
}) => InternalMetricsBus;
//# sourceMappingURL=index.d.ts.map