import type { HistoricalObservation } from '@irp/network-intelligence';
import type { CandidateAction, Incident, RuntimeContext } from '../domain/types.js';
import type { FederatedEvidenceProvider } from '../ports/ports.js';
import { ProbeFederation, type ProbeEvidence } from './probe-federation.js';

export interface FederatedEvidenceAdvisorOptions {
  readonly maxEvidence?: number;
}

/**
 * Converts accepted, signed probe evidence into advisory ranking input. Remote
 * evidence is used only when the current observation explicitly identifies a
 * destination, preventing regional probes for one destination from affecting
 * a decision for another.
 */
export class FederatedEvidenceAdvisor implements FederatedEvidenceProvider {
  private readonly maxEvidence: number;

  constructor(
    private readonly federation: ProbeFederation,
    options: FederatedEvidenceAdvisorOptions = {},
  ) {
    this.maxEvidence = Math.min(500, Math.max(1, Math.floor(options.maxEvidence ?? 100)));
  }

  async observationsFor(
    candidates: readonly CandidateAction[],
    _incidents: readonly Incident[],
    context: RuntimeContext,
  ): Promise<Readonly<Record<string, readonly HistoricalObservation[]>>> {
    const destination = destinationFromContext(context);
    if (!destination || !candidates.length) return {};
    const evidence = this.federation
      .listEvidence({ destination, limit: this.maxEvidence })
      .map((signed) => signed.payload);
    return Object.fromEntries(
      candidates.map((candidate) => [
        candidate.id,
        evidence.filter((item) => belongsToCandidate(item, candidate)).map(toHistoricalObservation),
      ]),
    );
  }
}

const destinationFromContext = (context: RuntimeContext): string | undefined =>
  context.observationSnapshot?.observations
    .map((observation) => observation.metadata.destination)
    .find(
      (destination): destination is string =>
        typeof destination === 'string' && destination.length > 0,
    );

const belongsToCandidate = (evidence: ProbeEvidence, candidate: CandidateAction): boolean => {
  const target = evidence.metadata?.candidateId;
  return target === undefined || target === candidate.id || target === candidate.intent;
};

const toHistoricalObservation = (evidence: ProbeEvidence): HistoricalObservation => ({
  timestamp: evidence.observedAt,
  availabilityRatio:
    evidence.serviceStatus === 'reachable' ? 1 : evidence.serviceStatus === 'degraded' ? 0.5 : 0,
  reliabilityRatio:
    evidence.serviceStatus === 'reachable' ? 1 : evidence.serviceStatus === 'degraded' ? 0.5 : 0,
  uptimeRatio:
    evidence.serviceStatus === 'reachable' ? 1 : evidence.serviceStatus === 'degraded' ? 0.5 : 0,
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
});
