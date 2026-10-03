import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
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
/** @deprecated Prefer `rankByObjectives`, which scores against intent-derived
 * objectives. Retained for the legacy fixed ordering and for explainable
 * comparison in decision records. */
export const rankCandidates = (c: readonly CandidateAction[]) =>
  [...c].sort(
    (a, b) =>
      b.confidence - a.confidence ||
      b.expectedBenefit - a.expectedBenefit ||
      a.risk - b.risk ||
      a.intent.localeCompare(b.intent) ||
      a.id.localeCompare(b.id),
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
  async plan(candidates: readonly CandidateAction[], context: RuntimeContext): Promise<ActionPlan> {
    return this.planFromRanked(rankCandidates(candidates), context);
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
    const selectedEvaluation = evaluated.find(
      ({ candidate, policyResult }) =>
        candidate.rejectionReasons.length === 0 && policyResult.allowed,
    ) ??
      evaluated[0] ?? {
        candidate:
          fallbackPolicy.reasons.length === 0
            ? fallback
            : deepFreeze({ ...fallback, rejectionReasons: fallbackPolicy.reasons }),
        policyResult: fallbackPolicy,
      };
    const selected = selectedEvaluation.candidate;
    const policyResult = selectedEvaluation.policyResult;
    return deepFreeze({
      id: nextId('plan'),
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
export const noopCandidate = (context: RuntimeContext): CandidateAction =>
  deepFreeze({
    id: nextId('candidate'),
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
