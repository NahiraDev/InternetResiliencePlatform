import type { ActualOutcome, DecisionResult, EvaluationMetrics } from './NetworkDecisionEngine.js';
/**
 * Evaluates whether the engine made the correct intervention decision for the
 * observed outcome of the selected candidate.
 *
 * An intervention is any action other than `remain`. A failed selected
 * candidate therefore makes an intervention a true positive, while a healthy
 * selected candidate makes it a false positive. `remain` on a failed
 * candidate is a false negative.
 */
export declare class DecisionEvaluator {
    evaluate(decisions: readonly DecisionResult[], outcomes: readonly ActualOutcome[]): EvaluationMetrics;
}
//# sourceMappingURL=DecisionEvaluator.d.ts.map