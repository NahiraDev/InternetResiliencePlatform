import type { HistoricalMeasurementStore } from '@irp/historical-analysis';
import type { HistoricalObservation } from '@irp/network-intelligence';
import type { CandidateAction, Incident, RuntimeContext } from './domain/types.js';
import type { HistoricalEvidenceProvider } from './ports/ports.js';
export interface HistoricalAnalysisAdvisorOptions {
    readonly lookbackMs?: number;
    readonly maxSamples?: number;
}
/**
 * Adapts retained measurements into the network-intelligence history model.
 * Measurements are scoped to a candidate by `metadata.candidateId`, then by
 * probe type matching its id or intent. The adapter is deliberately advisory:
 * callers fail open when the store is unavailable and policy/safety remain
 * downstream of every ranking result.
 */
export declare class HistoricalAnalysisAdvisor implements HistoricalEvidenceProvider {
    private readonly store;
    private readonly lookbackMs;
    private readonly maxSamples;
    constructor(store: HistoricalMeasurementStore, options?: HistoricalAnalysisAdvisorOptions);
    observationsFor(candidates: readonly CandidateAction[], _incidents: readonly Incident[], context: RuntimeContext): Promise<Readonly<Record<string, readonly HistoricalObservation[]>>>;
}
//# sourceMappingURL=historical-advisory.d.ts.map