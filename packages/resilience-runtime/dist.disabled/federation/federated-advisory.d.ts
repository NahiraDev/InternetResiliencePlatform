import type { HistoricalObservation } from '@irp/network-intelligence';
import type { CandidateAction, Incident, RuntimeContext } from '../domain/types.js';
import type { FederatedEvidenceProvider } from '../ports/ports.js';
import { ProbeFederation } from './probe-federation.js';
export interface FederatedEvidenceAdvisorOptions {
    readonly maxEvidence?: number;
}
/**
 * Converts accepted, signed probe evidence into advisory ranking input. Remote
 * evidence is used only when the current observation explicitly identifies a
 * destination, preventing regional probes for one destination from affecting
 * a decision for another.
 */
export declare class FederatedEvidenceAdvisor implements FederatedEvidenceProvider {
    private readonly federation;
    private readonly maxEvidence;
    constructor(federation: ProbeFederation, options?: FederatedEvidenceAdvisorOptions);
    observationsFor(candidates: readonly CandidateAction[], _incidents: readonly Incident[], context: RuntimeContext): Promise<Readonly<Record<string, readonly HistoricalObservation[]>>>;
}
//# sourceMappingURL=federated-advisory.d.ts.map