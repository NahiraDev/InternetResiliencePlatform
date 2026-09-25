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
 * Composes intelligence output with intent governance without becoming a
 * second decision engine. Policy evaluation intentionally remains in the
 * canonical planner gate so a rejected candidate and its reason are retained
 * in the decision record rather than disappearing before planning.
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
    const compiledIntents =
      context.compiledIntents ?? (context.compiledIntent ? [context.compiledIntent] : []);
    const governance = resolveIntentGovernance(compiledIntents, context);
    const governedContext =
      governance.selectedIntent && governance.selectedIntent !== context.compiledIntent
        ? Object.freeze({
            ...context,
            compiledIntent: governance.selectedIntent,
          })
        : context;
    const candidates = await this.decisionProvider.decide(incidents, governedContext);
    const ranked = candidates
      .map((candidate) => this.applyGovernance(candidate, governance, context))
      .sort(compareCandidates);
    const blocked = ranked.filter((candidate) => candidate.rejectionReasons.length > 0);
    // This is intentionally a governance selection only. Policy admission is
    // performed by DeterministicPlanner, but a candidate already rejected by
    // intent governance must never be presented as selected to a consumer.
    const selectedCandidate = ranked.find((candidate) => candidate.rejectionReasons.length === 0) ?? null;

    return {
      candidates: ranked,
      selectedCandidate,
      blockedCandidates: blocked,
      reason: selectedCandidate
        ? governance.reasons.length
          ? `selected highest-confidence eligible candidate after intent governance: ${governance.reasons.join('; ')}`
          : 'selected highest-confidence eligible candidate using deterministic ordering'
        : governance.admission === 'REQUIRE_APPROVAL'
          ? 'no candidate admitted because intent governance requires approval'
          : governance.admission === 'DENY'
            ? 'no candidate admitted because intent governance denied the intent'
            : 'no candidate was admitted by intent governance',
      governance,
    };
  }

  private applyGovernance(
    candidate: CandidateAction,
    governance: ReturnType<typeof resolveIntentGovernance>,
    context: RuntimeContext,
  ): CandidateAction {
    const reasons = [...candidate.rejectionReasons];
    if (candidate.intent !== 'noop') {
      if (!governance.mutationAllowed && context.mode === 'live')
        reasons.push(...governance.reasons);
      if (candidate.risk > governance.maxRisk)
        reasons.push(`candidate risk ${candidate.risk} exceeds intent risk budget ${governance.maxRisk}`);
    }
    return reasons.length === candidate.rejectionReasons.length
      ? candidate
      : Object.freeze({ ...candidate, rejectionReasons: reasons });
  }

}

const compareCandidates = (a: CandidateAction, b: CandidateAction): number =>
  b.confidence - a.confidence ||
  b.expectedBenefit - a.expectedBenefit ||
  a.risk - b.risk ||
  a.id.localeCompare(b.id);
