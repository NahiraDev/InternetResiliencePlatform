import type { CandidateAction, Incident, RuntimeContext } from './domain/types.js';
import type { DecisionProvider } from './ports/ports.js';

export interface DecisionOrchestrationResult {
  readonly candidates: readonly CandidateAction[];
  readonly selectedCandidate: CandidateAction | null;
  readonly blockedCandidates: readonly CandidateAction[];
  readonly reason: string;
}

/**
 * Composes intelligence output with the runtime's policy, capability and
 * security constraints without becoming a second decision engine.
 *
 * Ordering is deterministic and mutation-free. The downstream planner remains
 * responsible for turning the selected candidate into an executable plan.
 */
export class DecisionOrchestrator {
  constructor(private readonly decisionProvider: DecisionProvider) {}

  async orchestrate(
    incidents: readonly Incident[],
    context: RuntimeContext,
  ): Promise<DecisionOrchestrationResult> {
    const candidates = await this.decisionProvider.decide(incidents, context);
    const allowed = candidates.filter((candidate) => this.isEligible(candidate, context));
    const blocked = candidates.filter((candidate) => !this.isEligible(candidate, context));
    const ranked = [...allowed].sort(compareCandidates);
    const selectedCandidate = ranked[0] ?? null;

    return {
      candidates: ranked,
      selectedCandidate,
      blockedCandidates: blocked,
      reason: selectedCandidate
        ? 'selected highest-confidence eligible candidate using deterministic ordering'
        : 'no candidate satisfied policy, capability and security constraints',
    };
  }

  private isEligible(candidate: CandidateAction, context: RuntimeContext): boolean {
    const policy = context.policySnapshot.policy;
    if (candidate.rejectionReasons.length > 0) return false;
    if (!policy.allowedActions.includes(candidate.intent)) return false;
    if (policy.deniedActions.includes(candidate.intent)) return false;
    if (candidate.confidence < policy.confidenceThreshold) return false;
    if (!context.capabilitySnapshot.trusted || !context.securityContext.trusted) return false;

    const requiredByPolicy = policy.capabilityRequirements[candidate.intent] ?? [];
    const required = new Set([...candidate.requiredCapabilities, ...requiredByPolicy]);
    const available = new Set(context.capabilitySnapshot.capabilities);
    return [...required].every((capability) => available.has(capability));
  }
}

const compareCandidates = (a: CandidateAction, b: CandidateAction): number =>
  b.confidence - a.confidence ||
  b.expectedBenefit - a.expectedBenefit ||
  a.risk - b.risk ||
  a.id.localeCompare(b.id);
