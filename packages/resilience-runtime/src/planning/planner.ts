import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
import type { ActionPlan, CandidateAction, RuntimeContext } from '../domain/types.js';
import { RuntimePolicyArbitrator } from '../policy/policy.js';
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
  async plan(candidates: readonly CandidateAction[], context: RuntimeContext): Promise<ActionPlan> {
    const ranked = rankCandidates(candidates);
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
    const selectedEvaluation =
      evaluated.find(
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
