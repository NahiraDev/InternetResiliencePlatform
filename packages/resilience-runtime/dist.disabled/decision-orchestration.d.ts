import type { CandidateAction, Incident, RuntimeContext } from './domain/types.js';
import type { DecisionProvider } from './ports/ports.js';
import { resolveIntentGovernance } from './intent/governance.js';
export interface DecisionOrchestrationResult {
    readonly candidates: readonly CandidateAction[];
    readonly selectedCandidate: CandidateAction | null;
    readonly blockedCandidates: readonly CandidateAction[];
    readonly reason: string;
    readonly governance: ReturnType<typeof resolveIntentGovernance>;
}
/**
 * Composes intelligence output with intent governance without becoming a
 * second decision engine. Policy evaluation intentionally remains in the
 * canonical planner gate so a rejected candidate and its reason are retained
 * in the decision record rather than disappearing before planning.
 *
 * Ordering is deterministic and mutation-free. The downstream planner remains
 * responsible for turning the selected candidate into an executable plan.
 */
export declare class DecisionOrchestrator {
    private readonly decisionProvider;
    constructor(decisionProvider: DecisionProvider);
    orchestrate(incidents: readonly Incident[], context: RuntimeContext): Promise<DecisionOrchestrationResult>;
    private applyGovernance;
}
//# sourceMappingURL=decision-orchestration.d.ts.map