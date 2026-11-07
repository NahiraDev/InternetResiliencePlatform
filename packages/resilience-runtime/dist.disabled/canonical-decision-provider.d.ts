import { InternetIntelligenceAgent } from '@irp/internet-intelligence-agent';
import type { CandidateAction, Incident, RuntimeContext } from './domain/types.js';
import type { DecisionProvider, PathEvidenceProvider } from './ports/ports.js';
import type { FederatedEvidenceProvider, HistoricalEvidenceProvider } from './ports/ports.js';
/**
 * Production decision boundary for the resilience runtime.
 *
 * The agent is advisory: it diagnoses evidence and biases candidate quality.
 * NetworkDecisionEngine remains the ranking authority; policy, capability,
 * security, validation, execution, verification, and recovery remain outside
 * this provider and cannot be bypassed by the agent.
 */
export declare class CanonicalDecisionProvider implements DecisionProvider {
    private readonly options;
    private readonly subsystem;
    private readonly engine;
    private readonly bridge;
    constructor(agent?: InternetIntelligenceAgent, options?: {
        agentTimeoutMs?: number;
        decisionTimeoutMs?: number;
        historicalEvidence?: HistoricalEvidenceProvider;
        federatedEvidence?: FederatedEvidenceProvider;
        pathEvidence?: PathEvidenceProvider;
    });
    decide(incidents: readonly Incident[], context: RuntimeContext): Promise<readonly CandidateAction[]>;
    private historyFor;
    private pathFor;
}
//# sourceMappingURL=canonical-decision-provider.d.ts.map