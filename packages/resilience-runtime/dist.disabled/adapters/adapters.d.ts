import type { CandidateAction, Incident, RuntimeContext } from '../domain/types.js';
import type { DecisionProvider } from '../ports/ports.js';
export declare class SubsystemDecisionAdapter implements DecisionProvider {
    decide(incidents: readonly Incident[], context: RuntimeContext): Promise<readonly CandidateAction[]>;
    private candidate;
}
//# sourceMappingURL=adapters.d.ts.map