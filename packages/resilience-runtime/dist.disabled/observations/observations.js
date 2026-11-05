import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
const normalizeObservation = (input, context) => {
    const freshnessMs = Date.parse(context.policySnapshot.createdAt) >= 0
        ? Date.now() - Date.parse(input.timestamp)
        : input.freshnessMs;
    const stale = freshnessMs > context.policySnapshot.policy.telemetryFreshnessMs;
    return deepFreeze({
        ...input,
        freshnessMs: Math.max(0, freshnessMs),
        status: stale ? 'stale' : input.status,
        confidence: Math.max(0, Math.min(1, input.confidence)),
        metadata: input.metadata ?? {},
    });
};
export class ObservationAggregator {
    providers;
    constructor(providers) {
        this.providers = providers;
    }
    async collect(context) {
        const results = await Promise.all(this.providers.map((p) => p.collect(context)));
        const observations = results
            .flatMap((r) => r.observations)
            .map((o) => normalizeObservation(o, context))
            .sort((a, b) => `${a.source}:${a.category}:${a.metric}`.localeCompare(`${b.source}:${b.category}:${b.metric}`));
        return deepFreeze({
            id: nextId('obsbatch'),
            schemaVersion: 1,
            createdAt: nowIso(),
            correlationId: context.correlationId,
            source: 'resilience-runtime',
            metadata: { providerCount: this.providers.length, errors: results.flatMap((r) => r.errors) },
            observations,
            stale: observations.some((o) => o.status === 'stale'),
            minConfidence: observations.length ? Math.min(...observations.map((o) => o.confidence)) : 0,
        });
    }
}
export class StaticObservationProvider {
    id;
    observations;
    constructor(id, observations) {
        this.id = id;
        this.observations = observations;
    }
    async collect() {
        return {
            providerId: this.id,
            observations: this.observations,
            collectedAt: nowIso(),
            errors: [],
        };
    }
}
//# sourceMappingURL=observations.js.map