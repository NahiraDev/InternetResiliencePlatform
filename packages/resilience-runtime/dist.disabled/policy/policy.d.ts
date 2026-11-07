import type { ActionPlan, CandidateAction, PolicyEvaluation, RuntimeContext, CompiledIntent, PolicySnapshot } from '../domain/types.js';
import type { IntentConflict } from '../intent/arbitration.js';
import { type IntentStore, type PolicyConflict } from '../intent/arbitration.js';
import { PolicyRegistry } from './registry.js';
export declare class RuntimePolicyArbitrator {
    private readonly intentStore;
    private readonly policyRegistry;
    constructor(intentStore?: IntentStore, policyRegistry?: PolicyRegistry);
    evaluate(target: ActionPlan | CandidateAction, context: RuntimeContext): Promise<PolicyEvaluation>;
    /** Resolves intent conflicts for the current context. */
    resolveIntentConflicts(context: RuntimeContext): Promise<{
        readonly ordered: readonly CompiledIntent[];
        readonly conflicts: readonly IntentConflict[];
        /**
         * True when the conflict journal could not be persisted. Arbitration itself
         * remains authoritative; only the durable record is missing.
         */
        readonly persistenceDegraded: boolean;
    }>;
    /** Resolves policy conflicts between two snapshots. */
    resolvePolicyConflicts(policyA: PolicySnapshot, policyB: PolicySnapshot, strategy?: 'union' | 'intersection' | 'hierarchical'): {
        readonly merged: PolicySnapshot;
        readonly conflicts: readonly PolicyConflict[];
    };
    /** Enforces autonomy at the mutation boundary. */
    enforceIntentAutonomy(intent: CompiledIntent, actionClass: 'read' | 'advise' | 'safe_mutate' | 'autonomous' | 'high_risk'): void;
}
//# sourceMappingURL=policy.d.ts.map