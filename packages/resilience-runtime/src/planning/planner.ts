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
    const selected =
      ranked.find((c) => !c.rejectionReasons.length) ?? ranked[0] ?? noopCandidate(context);
    const policyResult = await this.policy.evaluate(selected, context);
    return deepFreeze({
      id: nextId('plan'),
      schemaVersion: 1,
      createdAt: nowIso(),
      correlationId: context.correlationId,
      source: 'resilience-runtime',
      metadata: {},
      selectedAction: selected,
      alternatives: ranked.filter((c) => c.id !== selected.id),
      rejectionReasons: [...selected.rejectionReasons, ...policyResult.reasons],
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
