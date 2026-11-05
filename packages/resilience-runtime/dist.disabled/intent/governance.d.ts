import type { CompiledIntent } from '../domain/types.js';
import type { RuntimeContext } from '../domain/types.js';
export type IntentAdmission = 'ALLOW' | 'PLAN_ONLY' | 'REQUIRE_APPROVAL' | 'DENY';
export interface IntentGovernanceDecision {
    readonly admission: IntentAdmission;
    readonly selectedIntent?: CompiledIntent;
    readonly candidates: readonly CompiledIntent[];
    readonly rejectedIntents: readonly CompiledIntent[];
    readonly reasons: readonly string[];
    readonly mutationAllowed: boolean;
    readonly maxRisk: number;
}
/**
 * Governance-specific intent selection.
 *
 * Distinct from `arbitrateIntents` in ./arbitration.js, which orders intents and
 * reports conflicts for the canonical runtime cycle. This helper applies the
 * governance admission ordering (priority, confidence, autonomy, specificity)
 * and drops overlapping losers. The two were previously both exported as
 * `arbitrateIntents`, which created an ambiguous duplicate contract.
 */
export declare const selectGovernedIntents: (intents: readonly CompiledIntent[]) => {
    selectedIntent?: CompiledIntent;
    candidates: readonly CompiledIntent[];
    rejectedIntents: readonly CompiledIntent[];
};
export declare const resolveIntentGovernance: (intents: readonly CompiledIntent[], context: RuntimeContext) => IntentGovernanceDecision;
//# sourceMappingURL=governance.d.ts.map