import { nextId, nowIso } from './domain/ids.js';
class ObservationProviderRegistry {
    providers = new Map();
    register(provider) {
        this.providers.set(provider.id, provider);
    }
    list() {
        return [...this.providers.values()];
    }
    async collect(context) {
        return Promise.all(this.list().map((p) => p.collect(context).catch((e) => ({
            providerId: p.id,
            collectedAt: nowIso(),
            errors: [e instanceof Error ? e.message : 'provider failed'],
            observations: [observation(p.id, p.id, 'provider_error', 'failed', String(e))],
        }))));
    }
}
export const observation = (source, category, metric, status = 'unknown', value = null) => ({
    id: nextId('obs'),
    schemaVersion: 1,
    createdAt: nowIso(),
    source,
    metadata: {},
    category,
    metric,
    value,
    timestamp: nowIso(),
    freshnessMs: 0,
    confidence: status === 'unknown' ? 0 : 0.8,
    severity: status === 'healthy'
        ? 'info'
        : status === 'degraded' || status === 'stale'
            ? 'warning'
            : 'critical',
    status,
});
export class TruthfulObservationProvider {
    id;
    category;
    status;
    constructor(id, category, status = 'unknown') {
        this.id = id;
        this.category = category;
        this.status = status;
    }
    async collect() {
        return {
            providerId: this.id,
            collectedAt: nowIso(),
            errors: [],
            observations: [observation(this.id, this.category, 'health', this.status)],
        };
    }
}
export const createDefaultObservationProviderRegistry = () => {
    const r = new ObservationProviderRegistry();
    for (const [id, cat] of [
        ['connectivity', 'connectivity'],
        ['network-intelligence', 'network'],
        ['routing', 'routing'],
        ['dns', 'dns'],
        ['tunnel', 'tunnel'],
        ['failover', 'failover'],
        ['security', 'security'],
        ['plugin', 'plugin'],
        ['telemetry', 'telemetry'],
    ])
        r.register(new TruthfulObservationProvider(id, cat, 'unknown'));
    return r;
};
//# sourceMappingURL=observation-providers.js.map