import { type Registry } from 'prom-client';
import type { InternalMetricsBus, MetricDefinition, MetricPoint } from '@irp/metrics';
export interface PrometheusBridge {
    readonly registry: Registry;
    subscribe(): () => void;
    registerDefinition(definition: MetricDefinition): void;
    record(point: MetricPoint): void;
}
export declare const createPrometheusBridge: (bus: InternalMetricsBus, registry?: Registry) => PrometheusBridge;
export declare const createDefaultPrometheusRegistry: () => Registry;
export declare const renderPrometheusRegistry: (registry: Registry) => Promise<string>;
export declare const prometheusRegistryContentType: (registry: Registry) => string;
//# sourceMappingURL=prometheus.d.ts.map