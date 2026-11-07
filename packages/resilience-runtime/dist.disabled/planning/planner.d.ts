import type { ActionPlan, CandidateAction, CompiledIntent, RuntimeContext } from '../domain/types.js';
import { RuntimePolicyArbitrator } from '../policy/policy.js';
import { type ObjectiveEvidence, type ObjectiveVector, type ScoredCandidate } from './objectives.js';
/**
 * The one ranking entry point.
 *
 * A second comparator here produced a second, incompatible ordering inside the
 * canonical planner, so the same candidate set could rank two different ways
 * depending on which entry point a caller used.
 */
export declare const rankCandidates: (candidates: readonly CandidateAction[], context: RuntimeContext, options?: {
    readonly intent?: CompiledIntent;
    readonly objectives?: ObjectiveVector;
    readonly evidenceFor?: (candidate: CandidateAction) => ObjectiveEvidence;
}) => readonly ScoredCandidate[];
export declare class DeterministicPlanner {
    private readonly policy;
    constructor(policy?: RuntimePolicyArbitrator);
    /**
     * Builds a plan against intent-derived objectives (issue #277 Section F).
     * When no compiled intent is supplied, uniform weighting is used so
     * behaviour stays deterministic and explainable.
     */
    planAgainstObjectives(candidates: readonly CandidateAction[], context: RuntimeContext, options?: {
        readonly intent?: CompiledIntent;
        readonly objectives?: ObjectiveVector;
        readonly evidenceFor?: (candidate: CandidateAction) => ObjectiveEvidence;
    }): Promise<{
        readonly plan: ActionPlan;
        readonly scored: readonly ScoredCandidate[];
        readonly objectives: ObjectiveVector;
    }>;
    /**
     * Plans without an explicit intent. Kept as a compatible entry point; it uses
     * the same ranking authority as `planAgainstObjectives` with uniform weights.
     */
    plan(candidates: readonly CandidateAction[], context: RuntimeContext): Promise<ActionPlan>;
    private planFromRanked;
}
/**
 * The inert candidate used when nothing else is eligible.
 *
 * Its id is derived from the correlation id rather than a process-global
 * counter: a counter-derived id made tie-breaks and replay comparisons depend
 * on how many ids happened to be minted earlier in the process.
 */
export declare const noopCandidate: (context: RuntimeContext) => CandidateAction;
//# sourceMappingURL=planner.d.ts.map