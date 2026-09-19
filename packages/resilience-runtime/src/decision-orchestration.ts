import type { CandidateAction, Incident, RuntimeContext } from './domain/types.js';
import type { DecisionProvider } from './ports/ports.js';
import { resolveIntentGovernance } from './intent/governance.js';

export interface DecisionOrchestrationResult {
  readonly candidates: readonly CandidateAction[];
  readonly selectedCandidate: CandidateAction | null;
  readonly blockedCandidates: readonly CandidateAction[];
  readonly reason: string;
  readonly governance: ReturnType<typeof resolveIntentGovernance>;
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
    const compiledIntents = context.compiledIntents ?? (context.compiledIntent ? [context.compiledIntent] : []);
    const governance = resolveIntentGovernance(compiledIntents, context);
    const allowed = candidates
      .map((candidate) => this.applyGovernance(candidate, governance))
      .filter((candidate) => this.isEligible(candidate, context));
    const blocked = candidates
      .map((candidate) => this.applyGovernance(candidate, governance))
      .filter((candidate) => !this.isEligible(candidate, context));
    const ranked = [...allowed].sort(compareCandidates);
    const selectedCandidate = ranked[0] ?? null;

    return {
      candidates: ranked,
      selectedCandidate,
      blockedCandidates: blocked,
      reason: selectedCandidate
        ? governance.reasons.length
          ? \\`selected highest-confidence eligible candidate after intent governance: \\${governance.reasons.join('; ')}\\`
          : 'selected highest-confidence eligible candidate using deterministic ordering'
        : governance.admission === 'REQUIRE_APPROVAL'
          ? 'no candidate admitted because intent governance requires approval'
          : governance.admission === 'DENY'
            ? 'no candidate admitted because intent governance denied the intent'
            : 'no candidate satisfied policy, capability and security constraints',
      governance,
    };
  }

  private applyGovernance(
    candidate: CandidateAction,
    governance: ReturnType<typeof resolveIntentGovernance>,
  ): CandidateAction {
    const reasons = [...candidate.rejectionReasons];
    if (candidate.intent !== 'noop') {
      if (!governance.mutationAllowed) reasons.push(...governance.reasons);
      if (candidate.risk > governance.maxRisk)
        reasons.push(\`candidate risk \\${candidate.risk} exceeds intent risk budget \\${governance.maxRisk}\`);
    }
    return reasons.length === candidate.rejectionReasons.length
      ? candidate
      : Object.freeze({ ...candidate, rejectionReasons: reasons });
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
