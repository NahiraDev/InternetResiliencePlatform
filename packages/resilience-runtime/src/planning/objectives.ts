/**
 * Intent-derived objective model and multi-candidate strategy optimization for
 * issue #277 (issue #272 Section F).
 *
 * The canonical planner previously ranked candidates with a fixed
 * `confidence -> expectedBenefit -> risk` sort. Section F requires optimization
 * against objectives derived from the active intent (reachability, latency,
 * jitter, loss, throughput, stability, privacy, trust, security, cost, resource
 * usage, diversity, recovery probability) instead of one hard-coded score.
 */

import type { CandidateAction, CompiledIntent } from '../domain/types.js';

/** The Section F objective set. Order is stable so scores are reproducible. */
export const STRATEGY_OBJECTIVES = [
  'reachability',
  'latency',
  'jitter',
  'packetLoss',
  'throughput',
  'stability',
  'privacy',
  'trust',
  'security',
  'cost',
  'resourceUsage',
  'diversity',
  'recoveryProbability',
] as const;

export type StrategyObjective = (typeof STRATEGY_OBJECTIVES)[number];

export type ObjectiveVector = Readonly<Record<StrategyObjective, number>>;

/**
 * Per-candidate evidence for each objective, in [0, 1] where 1 is always best.
 * Callers supply measured or derived evidence; nothing is invented here.
 */
export type ObjectiveEvidence = Readonly<Record<StrategyObjective, number>>;

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

export const emptyObjectives = (): ObjectiveVector =>
  Object.freeze(
    Object.fromEntries(STRATEGY_OBJECTIVES.map((objective) => [objective, 0])) as ObjectiveVector,
  );

/** Uniform weighting, used when no compiled intent supplies preferences. */
export const uniformObjectives = (): ObjectiveVector =>
  Object.freeze(
    Object.fromEntries(
      STRATEGY_OBJECTIVES.map((objective) => [objective, 1 / STRATEGY_OBJECTIVES.length]),
    ) as ObjectiveVector,
  );

const INTENT_OBJECTIVE_ALIASES: Readonly<Record<string, StrategyObjective>> = {
  reachability: 'reachability',
  latency: 'latency',
  jitter: 'jitter',
  packetLoss: 'packetLoss',
  throughput: 'throughput',
  stability: 'stability',
  reliability: 'stability',
  privacy: 'privacy',
  trust: 'trust',
  cost: 'cost',
  diversity: 'diversity',
  security: 'security',
  resourceUsage: 'resourceUsage',
  recoveryProbability: 'recoveryProbability',
};

/** Budget reserved for objectives the intent does not express, so an intent that
 * only names latency still cannot silently zero out the other 12 dimensions. */
const RESIDUAL_SHARE = 0.25;

/**
 * Projects a compiled intent's objectives onto the Section F objective set.
 * Expressed objectives share `(1 - RESIDUAL_SHARE)` of the budget in proportion
 * to their stated weight; unexpressed objectives share the remainder equally.
 * Weights always sum to 1, so scores stay comparable across intents.
 */
export const objectivesFromIntent = (
  intent: CompiledIntent | undefined,
  fallback: ObjectiveVector = uniformObjectives(),
): ObjectiveVector => {
  if (!intent) return fallback;
  const weights: Partial<Record<StrategyObjective, number>> = {};
  for (const [key, value] of Object.entries(intent.objectives ?? {})) {
    const mapped = INTENT_OBJECTIVE_ALIASES[key];
    if (mapped && Number.isFinite(value)) weights[mapped] = clamp01(value);
  }
  const expressed = Object.entries(weights).filter(([, value]) => value > 0);
  if (expressed.length === 0) return fallback;
  const expressedSum = expressed.reduce((sum, [, value]) => sum + (value as number), 0);
  const unexpressed = STRATEGY_OBJECTIVES.filter((objective) => weights[objective] === undefined);
  // When the intent expresses every objective there is nothing to hold back for,
  // so the expressed weights take the whole budget instead of leaving a deficit.
  const expressedBudget = unexpressed.length > 0 ? 1 - RESIDUAL_SHARE : 1;
  const unexpressedShare = unexpressed.length > 0 ? RESIDUAL_SHARE / unexpressed.length : 0;
  return Object.freeze(
    Object.fromEntries(
      STRATEGY_OBJECTIVES.map((objective) => {
        const weight = weights[objective];
        if (weight !== undefined && expressedSum > 0) {
          return [objective, clamp01((weight / expressedSum) * expressedBudget)];
        }
        return [objective, unexpressedShare];
      }),
    ) as ObjectiveVector,
  );
};

/** Derived objective evidence for a candidate that exposes no measurements. */
export const defaultEvidenceFor = (
  candidate: Pick<CandidateAction, 'expectedBenefit' | 'risk' | 'confidence'>,
): ObjectiveEvidence => {
  const confidence = clamp01(candidate.confidence);
  const benefit = clamp01(candidate.expectedBenefit);
  const risk = clamp01(candidate.risk);
  return Object.freeze({
    reachability: benefit,
    latency: 1 - risk,
    jitter: 1 - risk,
    packetLoss: 1 - risk,
    throughput: benefit,
    stability: 1 - risk,
    // A candidate cannot prove privacy/security/trust/diversity, so they score
    // neutrally rather than being invented as favourable.
    privacy: 0.5,
    trust: confidence,
    security: 0.5,
    cost: 1 - risk,
    resourceUsage: 1 - risk,
    diversity: 0.5,
    recoveryProbability: clamp01(1 - risk),
  } satisfies ObjectiveEvidence);
};

export interface ScoredCandidate {
  readonly candidate: CandidateAction;
  readonly score: number;
  /** Per-objective contribution to the final score, for explainability. */
  readonly contributions: Readonly<Record<StrategyObjective, number>>;
}

/**
 * Weighted, explainable scoring. Every contribution is retained so a decision
 * can be justified against the intent rather than a black-box score.
 */
export const scoreCandidate = (
  candidate: CandidateAction,
  objectives: ObjectiveVector,
  evidence: ObjectiveEvidence = defaultEvidenceFor(candidate),
): ScoredCandidate => {
  const contributions: Record<string, number> = {};
  let score = 0;
  let weightTotal = 0;
  for (const objective of STRATEGY_OBJECTIVES) {
    const weight = objectives[objective];
    const value = clamp01(evidence[objective]);
    const contribution = weight * value;
    contributions[objective] = contribution;
    score += contribution;
    weightTotal += weight;
  }
  return {
    candidate,
    score: weightTotal > 0 ? score / weightTotal : 0,
    contributions: Object.freeze(contributions) as Readonly<Record<StrategyObjective, number>>,
  };
};

/**
 * Ranks candidates against intent-derived objectives. Ties fall back to the
 * previous deterministic ordering so behaviour stays reproducible.
 */
export const rankByObjectives = (
  candidates: readonly CandidateAction[],
  objectives: ObjectiveVector,
  evidenceFor: (candidate: CandidateAction) => ObjectiveEvidence = defaultEvidenceFor,
): readonly ScoredCandidate[] =>
  candidates
    .map((candidate) => scoreCandidate(candidate, objectives, evidenceFor(candidate)))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.candidate.confidence - a.candidate.confidence ||
        b.candidate.expectedBenefit - a.candidate.expectedBenefit ||
        a.candidate.risk - b.candidate.risk ||
        a.candidate.intent.localeCompare(b.candidate.intent) ||
        a.candidate.id.localeCompare(b.candidate.id),
    );
