const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_SAMPLES = 200;
/**
 * Adapts retained measurements into the network-intelligence history model.
 * Measurements are scoped to a candidate by `metadata.candidateId`, then by
 * probe type matching its id or intent. The adapter is deliberately advisory:
 * callers fail open when the store is unavailable and policy/safety remain
 * downstream of every ranking result.
 */
export class HistoricalAnalysisAdvisor {
    store;
    lookbackMs;
    maxSamples;
    constructor(store, options = {}) {
        this.store = store;
        this.lookbackMs = bounded(options.lookbackMs ?? DEFAULT_LOOKBACK_MS, 1_000, 7 * 24 * 60 * 60 * 1000);
        this.maxSamples = bounded(options.maxSamples ?? DEFAULT_MAX_SAMPLES, 1, 1_000);
    }
    async observationsFor(candidates, _incidents, context) {
        if (!candidates.length)
            return {};
        const now = Date.parse(context.observationSnapshot?.createdAt ?? new Date().toISOString());
        const end = Number.isFinite(now) ? now : Date.now();
        const measurements = await this.store.query({
            from: new Date(end - this.lookbackMs).toISOString(),
            to: new Date(end + 1).toISOString(),
            probeTypes: [...new Set(candidates.flatMap((candidate) => [candidate.id, candidate.intent]))],
            limit: this.maxSamples,
        });
        const destination = destinationFromContext(context);
        return Object.fromEntries(candidates.map((candidate) => [
            candidate.id,
            measurements
                .filter((measurement) => belongsToCandidate(measurement, candidate, destination))
                .map(toHistoricalObservation),
        ]));
    }
}
const bounded = (value, min, max) => Math.min(max, Math.max(min, Math.floor(value)));
const belongsToCandidate = (measurement, candidate, destination) => {
    const metadata = measurement.metadata;
    const candidateId = metadata?.candidateId;
    const observedDestination = stringMetadata(metadata, 'destination');
    const candidateDestination = stringMetadata(candidate.metadata, 'destination') ?? destination;
    if (candidateDestination && observedDestination && candidateDestination !== observedDestination)
        return false;
    for (const key of ['providerId', 'pathId', 'region', 'failureDomain']) {
        const requested = stringMetadata(candidate.metadata, key);
        const observed = stringMetadata(metadata, key);
        if (requested && observed && requested !== observed)
            return false;
    }
    return (candidateId === candidate.id ||
        measurement.probeType === candidate.id ||
        measurement.probeType === candidate.intent);
};
const toHistoricalObservation = (measurement) => {
    const metadata = measurement.metadata;
    const destination = stringMetadata(metadata, 'destination');
    const providerId = stringMetadata(metadata, 'providerId');
    const pathId = stringMetadata(metadata, 'pathId');
    const region = stringMetadata(metadata, 'region');
    const failureDomain = stringMetadata(metadata, 'failureDomain');
    return {
        timestamp: measurement.timestamp,
        availabilityRatio: measurement.success ? 1 : 0,
        reliabilityRatio: measurement.success ? 1 : 0,
        uptimeRatio: measurement.success ? 1 : 0,
        ...(destination ? { destination } : {}),
        ...(providerId ? { providerId } : {}),
        ...(pathId ? { pathId } : {}),
        ...(region ? { region } : {}),
        ...(failureDomain ? { failureDomain } : {}),
        ...(measurement.latencyMs === undefined ? {} : { latencyMs: measurement.latencyMs }),
        ...(measurement.packetLossPercent === undefined
            ? {}
            : { packetLossRatio: Math.min(1, Math.max(0, measurement.packetLossPercent / 100)) }),
        ...(measurement.success ? { recoveryCount: 1 } : { failureCount: 1 }),
    };
};
const destinationFromContext = (context) => context.observationSnapshot?.observations
    .map((observation) => observation.metadata.destination)
    .find((destination) => typeof destination === 'string' && destination.length > 0);
const stringMetadata = (metadata, key) => {
    const value = metadata?.[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
};
//# sourceMappingURL=historical-advisory.js.map