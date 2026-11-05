/**
 * Multi-candidate strategy generation for issue #277 (issue #272 Section F).
 *
 * Section F requires the runtime to "generate multiple candidate strategies"
 * per intent rather than planning a single action. Generation is a deterministic
 * template expansion inside the canonical runtime: it proposes a primary
 * strategy plus fallback/conservative/alternates, and never filters policy.
 * Policy evaluation stays at the canonical planning gate.
 */
import type { ActionIntent, CandidateAction, CompiledIntent, RuntimeContext } from '../domain/types.js';
export type StrategyKind = 'primary' | 'fallback' | 'conservative' | 'alternate';
export interface StrategyTemplate {
    readonly kind: StrategyKind;
    readonly intent: ActionIntent;
    /** Multiplier applied to the primary candidate's expected benefit. */
    readonly benefitScale: number;
    /** Multiplier applied to the primary candidate's risk. */
    readonly riskScale: number;
    readonly rationale: string;
}
export interface GeneratedStrategy {
    readonly kind: StrategyKind;
    readonly candidate: CandidateAction;
    readonly rationale: string;
}
/**
 * Expands templates into concrete candidates. `seed` provides the base benefit,
 * risk and confidence for the primary action; the remaining strategies are
 * derived from it deterministically.
 */
export declare const generateStrategies: (input: {
    readonly context: RuntimeContext;
    readonly intent?: CompiledIntent;
    readonly templates?: readonly StrategyTemplate[];
    readonly seed: {
        readonly intent: ActionIntent;
        readonly expectedBenefit: number;
        readonly risk: number;
        readonly confidence: number;
        readonly requiredCapabilities?: readonly string[];
        readonly postconditions?: readonly string[];
        readonly verificationRequirements?: readonly string[];
        readonly rollbackStrategy?: string;
    };
}) => readonly GeneratedStrategy[];
//# sourceMappingURL=strategy-generator.d.ts.map