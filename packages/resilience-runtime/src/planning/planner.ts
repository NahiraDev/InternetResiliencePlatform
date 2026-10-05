import { deepFreeze, nowIso } from '../domain/ids.js';
import type {
  ActionPlan,
  CandidateAction,
  CompiledIntent,
  RuntimeContext,
} from '../domain/types.js';
import { RuntimePolicyArbitrator } from '../policy/policy.js';
import {
  type ObjectiveEvidence,
  type ObjectiveVector,
  type ScoredCandidate,
  objectivesFromIntent,
  rankByObjectives,
  uniformObjectives,
} from './objectives.js';

/**
 * The one ranking entry point.
 *
 * A second comparator here produced a second, incompatible ordering inside the
 * canonical planner, so the same candidate set could rank two different ways
 * depending on which entry point a caller used.
 */
export const rankCandidates = (
  candidates: readonly CandidateAction[],
  context: RuntimeContext,
  options: {
    readonly intent?: CompiledIntent;
    readonly objectives?: ObjectiveVector;
    readonly evidenceFor?: (candidate: CandidateAction) => ObjectiveEvidence;
  } = {},
): readonly ScoredCandidate[] =>
  rankByObjectives(
    candidates,
    options.objectives ?? objectivesFromIntent(options.intent, uniformObjectives()),
    options.evidenceFor,
  );
export class DeterministicPlanner {
  constructor(private readonly policy = new RuntimePolicyArbitrator()) {}
  /**
   * Builds a plan against intent-derived objectives (issue #277 Section F).
   * When no compiled intent is supplied, uniform weighting is used so
   * behaviour stays deterministic and explainable.
   */
  async planAgainstObjectives(
    candidates: readonly CandidateAction[],
    context: RuntimeContext,
    options: {
      readonly intent?: CompiledIntent;
      readonly objectives?: ObjectiveVector;
      readonly evidenceFor?: (candidate: CandidateAction) => ObjectiveEvidence;
    } = {},
  ): Promise<{
    readonly plan: ActionPlan;
    readonly scored: readonly ScoredCandidate[];
    readonly objectives: ObjectiveVector;
  }> {
    const objectives =
      options.objectives ?? objectivesFromIntent(options.intent, uniformObjectives());
    const scored = rankByObjectives(candidates, objectives, options.evidenceFor);
    const plan = await this.planFromRanked(
      scored.map((entry) => entry.candidate),
      context,
    );
    const selectedScore = scored.find((entry) => entry.candidate.id === plan.selectedAction.id);
    return {
      plan: deepFreeze({
        ...plan,
        metadata: {
          ...plan.metadata,
          optimization: {
            objectiveScore: selectedScore?.score ?? 0,
            objectives,
          },
        },
      }),
      scored,
      objectives,
    };
  }
  /**
   * Plans without an explicit intent. Kept as a compatible entry point; it uses
   * the same ranking authority as `planAgainstObjectives` with uniform weights.
   */
  async plan(candidates: readonly CandidateAction[], context: RuntimeContext): Promise<ActionPlan> {
    const { plan } = await this.planAgainstObjectives(candidates, context);
    return plan;
  }
  private async planFromRanked(
    ranked: readonly CandidateAction[],
    context: RuntimeContext,
  ): Promise<ActionPlan> {
    // Policy is evaluated here, at the canonical planning gate.  Retain the
    // evaluated candidates so policy-denied alternatives remain explainable in
    // the plan and final DecisionRecord instead of being filtered upstream.
    const evaluated = await Promise.all(
      ranked.map(async (candidate) => {
        const policyResult = await this.policy.evaluate(candidate, context);
        const rejectionReasons = [...candidate.rejectionReasons, ...policyResult.reasons];
        return {
          candidate:
            rejectionReasons.length === candidate.rejectionReasons.length
              ? candidate
              : deepFreeze({ ...candidate, rejectionReasons }),
          policyResult,
        };
      }),
    );
    const fallback = noopCandidate(context);
    const fallbackPolicy = await this.policy.evaluate(fallback, context);
    const eligible = evaluated.find(
      ({ candidate, policyResult }) =>
        candidate.rejectionReasons.length === 0 && policyResult.allowed,
    );
    // Fail-closed: when every candidate is denied, the plan still reports the
    // highest-ranked denied candidate so the denial is visible and the cycle is
    // blocked. Substituting the permitted noop fallback here would silently hide
    // the governance decision and let the cycle succeed having done nothing.
    // `evaluated[0]` is the highest-ranked entry because `evaluated` preserves the
    // deterministically ranked order, so this selection is reproducible.
    const denied = evaluated.length > 0 ? evaluated[0] : undefined;
    const selectedEvaluation = eligible ??
      denied ?? {
        candidate:
          fallbackPolicy.reasons.length === 0
            ? fallback
            : deepFreeze({ ...fallback, rejectionReasons: fallbackPolicy.reasons }),
        policyResult: fallbackPolicy,
      };
    const selected = selectedEvaluation.candidate;
    const policyResult = selectedEvaluation.policyResult;
    return deepFreeze({
      id: `plan-${context.correlationId}`,
      schemaVersion: 1,
      createdAt: nowIso(),
      correlationId: context.correlationId,
      source: 'resilience-runtime',
      metadata: {},
      selectedAction: selected,
      alternatives: evaluated
        .map(({ candidate }) => candidate)
        .filter((candidate) => candidate.id !== selected.id),
      rejectionReasons: selected.rejectionReasons,
      expectedBenefit: selected.expectedBenefit,
      risk: selected.risk,
      confidence: selected.confidence,
      policyResult,
      requiredCapabilities: policyResult.requiredCapabilities,
      dependencies: selected.dependencies,
      expectedPostconditions: selected.postconditions,
      verificationRequirements: selected.verificationRequirements,
      rollbackStrategy: selected.rollbackStrategy,
    });
  }
}
/**
 * The inert candidate used when nothing else is eligible.
 *
 * Its id is derived from the correlation id rather than a process-global
 * counter: a counter-derived id made tie-breaks and replay comparisons depend
 * on how many ids happened to be minted earlier in the process.
 */
export const noopCandidate = (context: RuntimeContext): CandidateAction =>
  deepFreeze({
    id: `candidate-noop-${context.correlationId}`,
    schemaVersion: 1,
    createdAt: nowIso(),
    correlationId: context.correlationId,
    source: 'resilience-runtime',
    metadata: {},
    intent: 'noop',
    expectedBenefit: 0,
    risk: 0,
    confidence: 1,
    requiredCapabilities: [],
    dependencies: [],
    postconditions: ['no mutation performed'],
    verificationRequirements: [],
    rejectionReasons: [],
  });
