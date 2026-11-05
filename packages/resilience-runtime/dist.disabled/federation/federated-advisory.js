/**
 * Converts accepted, signed probe evidence into advisory ranking input. Remote
 * evidence is used only when the current observation explicitly identifies a
 * destination, preventing regional probes for one destination from affecting
 * a decision for another.
 */
export class FederatedEvidenceAdvisor {
    federation;
    maxEvidence;
    constructor(federation, options = {}) {
        this.federation = federation;
        this.maxEvidence = Math.min(500, Math.max(1, Math.floor(options.maxEvidence ?? 100)));
    }
    async observationsFor(candidates, _incidents, context) {
        const destination = destinationFromContext(context);
        if (!destination || !candidates.length)
            return {};
        const evidence = this.federation
            .listEvidence({ destination, limit: this.maxEvidence })
            .map((signed) => signed.payload);
        return Object.fromEntries(candidates.map((candidate) => [
            candidate.id,
            evidence.filter((item) => belongsToCandidate(item, candidate)).map(toHistoricalObservation),
        ]));
    }
}
const destinationFromContext = (context) => context.observationSnapshot?.observations
    .map((observation) => observation.metadata.destination)
    .find((destination) => typeof destination === 'string' && destination.length > 0);
const belongsToCandidate = (evidence, candidate) => {
    const metadata = evidence.metadata;
    const target = metadata?.candidateId;
    if (target !== undefined && target !== candidate.id && target !== candidate.intent)
        return false;
    for (const key of ['providerId', 'pathId', 'region', 'failureDomain']) {
        const requested = metadataString(candidate.metadata, key);
        const observed = metadata?.[key];
        if (requested && observed !== undefined && requested !== String(observed))
            return false;
    }
    return true;
};
const toHistoricalObservation = (evidence) => {
    const providerId = metadataString(evidence.metadata, 'providerId');
    const pathId = metadataString(evidence.metadata, 'pathId');
    const failureDomain = metadataString(evidence.metadata, 'failureDomain');
    return {
        timestamp: evidence.observedAt,
        destination: evidence.destination,
        region: evidence.region,
        ...(providerId ? { providerId } : {}),
        ...(pathId ? { pathId } : {}),
        ...(failureDomain ? { failureDomain } : {}),
        availabilityRatio: evidence.serviceStatus === 'reachable' ? 1 : evidence.serviceStatus === 'degraded' ? 0.5 : 0,
        reliabilityRatio: evidence.serviceStatus === 'reachable' ? 1 : evidence.serviceStatus === 'degraded' ? 0.5 : 0,
        uptimeRatio: evidence.serviceStatus === 'reachable' ? 1 : evidence.serviceStatus === 'degraded' ? 0.5 : 0,
        ...(evidence.measurements.latencyMs === undefined
            ? {}
            : { latencyMs: evidence.measurements.latencyMs }),
        ...(evidence.measurements.jitterMs === undefined
            ? {}
            : { jitterMs: evidence.measurements.jitterMs }),
        ...(evidence.measurements.packetLossPercent === undefined
            ? {}
            : { packetLossRatio: evidence.measurements.packetLossPercent / 100 }),
        ...(evidence.serviceStatus === 'reachable' ? { recoveryCount: 1 } : { failureCount: 1 }),
    };
};
const metadataString = (metadata, key) => {
    const value = metadata?.[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
};
//# sourceMappingURL=federated-advisory.js.map