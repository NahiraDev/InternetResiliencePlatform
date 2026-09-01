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
export class DecisionEvaluator {
  evaluate(
    decisions: readonly DecisionResult[],
    outcomes: readonly ActualOutcome[],
  ): EvaluationMetrics {
    const byId = new Map(outcomes.map((outcome) => [outcome.candidateId, outcome]));
    let correct = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    let comparable = 0;
    let rankSum = 0;
    let calibrationError = 0;

    for (const decision of decisions) {
      const selected = decision.selectedCandidate;
      if (!selected) continue;

      const outcome = byId.get(selected.id);
      if (!outcome) continue;

      comparable += 1;
      const interventionRecommended = decision.recommendedAction !== 'remain' && decision.recommendedAction !== 'none';
      const actuallyFailed = outcome.failed === true;
      const actuallyHealthy = outcome.healthy === true && !actuallyFailed;

      if (interventionRecommended === actuallyFailed) correct += 1;
      if (interventionRecommended && actuallyHealthy) falsePositives += 1;
      if (!interventionRecommended && actuallyFailed) falseNegatives += 1;

      rankSum += outcome.rank && outcome.rank > 0 ? 1 / outcome.rank : 0;
      const observedHealth = actuallyHealthy ? 1 : 0;
      calibrationError += Math.abs(decision.confidence - observedHealth);
    }

    return {
      recommendationAccuracy: comparable ? correct / comparable : 0,
      falsePositiveRate: comparable ? falsePositives / comparable : 0,
      falseNegativeRate: comparable ? falseNegatives / comparable : 0,
      rankingQuality: comparable ? rankSum / comparable : 0,
      confidenceCalibration: comparable ? Math.max(0, 1 - calibrationError / comparable) : 0,
    };
  }
}
