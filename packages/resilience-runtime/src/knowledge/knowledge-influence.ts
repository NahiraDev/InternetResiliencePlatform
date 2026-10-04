/**
 * Knowledge -> canonical ranking integration for issue #276 (task 6).
 *
 * Acceptance requires that knowledge inputs *materially affect* canonical
 * decisions when valid. Previously history was annotated into candidate metadata
 * but never changed ranking, which did not satisfy that criterion.
 *
 * Two independent influences are applied, both strictly bounded:
 *  1. objective evidence from arbitrated knowledge;
 *  2. a failure-memory quarantine multiplier on the candidate score.
 *
 * This module produces objective evidence and score multipliers only. It cannot
 * grant a capability, allow an action or bypass policy.
 */

import type { CandidateAction } from '../domain/types.js';
import type { ObjectiveEvidence } from '../planning/objectives.js';
export type { ObjectiveEvidence };
import { STRATEGY_OBJECTIVES } from '../planning/objectives.js';
import { type ArbitratedEvidence, explainArbitration } from './arbitration.js';
import type { DecayingFailureMemory } from './failure-memory.js';

export interface KnowledgeInfluence {
  /** Objective evidence merged into the planner's evidence function. */
  readonly objectiveEvidence: ObjectiveEvidence;
  /** Score multiplier in [0,1] from failure-memory quarantine. */
  readonly scoreMultiplier: number;
  /** Human-readable explanation retained in the decision record. */
  readonly explanation: string;
  readonly advisoryShare: number;
}

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/**
 * Neutral evidence for objectives knowledge says nothing about. Knowledge may
 * only move an objective it actually measured; unmeasured objectives keep the
 * planner's own default so knowledge cannot silently dominate the score.
 */
export const neutralEvidence = (): ObjectiveEvidence =>
  Object.freeze(
    Object.fromEntries(
      STRATEGY_OBJECTIVES.map((objective) => [objective, 0.5]),
    ) as ObjectiveEvidence,
  );

/**
 * Merges arbitrated objective evidence into a neutral vector.
 * Only objectives present in the arbitration result are overridden.
 */
export const mergeKnowledgeEvidence = (
  base: ObjectiveEvidence,
  arbitrated: ArbitratedEvidence,
): ObjectiveEvidence => {
  const merged: Record<string, number> = {};
  for (const objective of STRATEGY_OBJECTIVES) {
    const value = arbitrated.evidence[objective];
    merged[objective] = value === undefined ? (base[objective] ?? 0.5) : clamp01(value);
  }
  // Knowledge may legitimately carry an objective outside the planner's set; it
  // is ignored rather than smuggled into the score.
  return Object.freeze(merged) as ObjectiveEvidence;
};

/**
 * Combines arbitrated knowledge with failure memory into a bounded influence.
 *
 * `candidateKey` identifies the strategy for failure-memory lookup; when it is
 * not a quarantine the multiplier stays at 1.
 */
export const knowledgeInfluenceFor = (input: {
  readonly base: ObjectiveEvidence;
  readonly arbitrated: ArbitratedEvidence;
  readonly failureMemory?: DecayingFailureMemory;
  readonly candidate: CandidateAction;
  readonly scope?: { destination?: string; providerId?: string };
  readonly nowMs?: number;
  readonly candidateKey?: string;
}): KnowledgeInfluence => {
  const objectiveEvidence = mergeKnowledgeEvidence(input.base, input.arbitrated);
  const strategyId =
    input.candidateKey ??
    (typeof input.candidate.metadata.quarantineKey === 'string'
      ? input.candidate.metadata.quarantineKey
      : undefined);

  let scoreMultiplier = 1;
  let quarantineNote = '';
  if (input.failureMemory !== undefined && strategyId !== undefined) {
    const multiplier = input.failureMemory.scoreMultiplier(
      strategyId,
      input.scope ?? {},
      input.nowMs,
    );
    scoreMultiplier = clamp01(multiplier);
    if (scoreMultiplier < 1) {
      const state = input.failureMemory.quarantineFor(strategyId, input.scope ?? {}, input.nowMs);
      quarantineNote =
        `; failureMemory ${state.quarantined ? 'quarantined' : 'penalised'} ` +
        `(weight=${state.decayedFailureWeight.toFixed(3)}, failures=${state.failureCount}, ` +
        `last=${state.lastFailureAt}) x${scoreMultiplier.toFixed(3)}`;
    }
  }

  const explanation = `${input.arbitrated.contributions.length > 0 ? explainArbitration(input.arbitrated) : 'no knowledge evidence'}${quarantineNote}`;
  return Object.freeze({
    objectiveEvidence,
    scoreMultiplier,
    explanation,
    advisoryShare: input.arbitrated.advisoryShare,
  });
};

/**
 * Builds a knowledge-aware evidence function for the planner.
 *
 * The returned function satisfies the planner's `evidenceFor` contract, so
 * knowledge participates in canonical ranking without duplicating the planner
 * or creating a second decision path.
 */
export const knowledgeEvidenceFunction = (input: {
  readonly arbitrated: ArbitratedEvidence;
  readonly baseEvidenceFor: (candidate: CandidateAction) => ObjectiveEvidence;
  readonly influences?: Readonly<Record<string, KnowledgeInfluence>>;
  /**
   * Per-candidate arbitration. Knowledge is scoped by destination, provider and
   * path, so evidence for one strategy must not be applied to another. When
   * supplied this takes precedence over the shared `arbitrated` result.
   */
  readonly arbitratedFor?: (candidate: CandidateAction) => ArbitratedEvidence;
}): ((candidate: CandidateAction) => ObjectiveEvidence) => {
  return (candidate: CandidateAction) => {
    const influence = input.influences?.[candidate.id];
    if (influence) return influence.objectiveEvidence;
    const arbitrated = input.arbitratedFor?.(candidate) ?? input.arbitrated;
    return mergeKnowledgeEvidence(input.baseEvidenceFor(candidate), arbitrated);
  };
};
