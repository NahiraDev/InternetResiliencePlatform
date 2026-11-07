import client from 'prom-client';
const sanitizeHelp = (value) => value.replace(/[\r\n]+/g, ' ').trim() || 'InternetResiliencePlatform metric';
const safeName = (name) => {
    if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name))
        throw new Error(`Invalid Prometheus metric name: ${name}`);
    return name;
};
const labelsForPoint = (point) => Object.keys(point.labels).sort();
const sameLabelSchema = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const metricType = (metric) => metric.constructor.name;
const createMetric = (registry, definition, labels) => {
    const name = safeName(definition.name);
    const help = sanitizeHelp(definition.description);
    if (definition.type === 'counter')
        return new client.Counter({ name, help, labelNames: labels, registers: [registry] });
    if (definition.type === 'gauge')
        return new client.Gauge({ name, help, labelNames: labels, registers: [registry] });
    return new client.Histogram({ name, help, labelNames: labels, registers: [registry] });
};
export const createPrometheusBridge = (bus, registry = new client.Registry()) => {
    const metrics = new Map();
    const metricLabels = new Map();
    const ensureMetric = (definition, point) => {
        const labels = labelsForPoint(point);
        const existingLabels = metricLabels.get(definition.name);
        if (existingLabels && !sameLabelSchema(existingLabels, labels)) {
            throw new Error(`Prometheus label schema conflict: ${definition.name}`);
        }
        const existing = metrics.get(definition.name);
        if (existing)
            return existing;
        const registered = registry.getSingleMetric(definition.name);
        if (registered) {
            metrics.set(definition.name, registered);
            metricLabels.set(definition.name, labels);
            const expectedType = definition.type === 'histogram'
                ? 'Histogram'
                : definition.type === 'counter'
                    ? 'Counter'
                    : 'Gauge';
            if (metricType(registered) !== expectedType)
                throw new Error(`Prometheus metric type conflict: ${definition.name}`);
            return registered;
        }
        metricLabels.set(definition.name, labels);
        const metric = createMetric(registry, definition, labels);
        metrics.set(definition.name, metric);
        return metric;
    };
    const bridge = {
        registry,
        registerDefinition(definition) {
            safeName(definition.name);
            sanitizeHelp(definition.description);
        },
        record(point) {
            const definition = bus.registry.get(point.name);
            if (!definition)
                throw new Error(`Metric is not registered: ${point.name}`);
            const metric = ensureMetric(definition, point);
            const labels = point.labels;
            if (definition.type === 'counter') {
                if (!(metric instanceof client.Counter))
                    throw new Error(`Prometheus metric type conflict: ${point.name}`);
                const counter = metric;
                counter.inc(labels, point.value);
            }
            else if (definition.type === 'gauge') {
                if (!(metric instanceof client.Gauge))
                    throw new Error(`Prometheus metric type conflict: ${point.name}`);
                const gauge = metric;
                gauge.set(labels, point.value);
            }
            else {
                if (!(metric instanceof client.Histogram))
                    throw new Error(`Prometheus metric type conflict: ${point.name}`);
                const histogram = metric;
                histogram.observe(labels, point.value);
            }
        },
        subscribe() {
            for (const definition of bus.registry.list())
                bridge.registerDefinition(definition);
            return bus.subscribe((point) => bridge.record(point));
        },
    };
    return bridge;
};
export const createDefaultPrometheusRegistry = () => {
    const registry = new client.Registry();
    client.collectDefaultMetrics({ register: registry, prefix: 'irp_' });
    return registry;
};
export const renderPrometheusRegistry = async (registry) => registry.metrics();
export const prometheusRegistryContentType = (registry) => registry.contentType;
//# sourceMappingURL=prometheus.js.map