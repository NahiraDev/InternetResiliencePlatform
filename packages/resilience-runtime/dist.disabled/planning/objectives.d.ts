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
export declare const STRATEGY_OBJECTIVES: readonly ["reachability", "latency", "jitter", "packetLoss", "throughput", "stability", "privacy", "trust", "security", "cost", "resourceUsage", "diversity", "recoveryProbability"];
export type StrategyObjective = (typeof STRATEGY_OBJECTIVES)[number];
export type ObjectiveVector = Readonly<Record<StrategyObjective, number>>;
/**
 * Per-candidate evidence for each objective, in [0, 1] where 1 is always best.
 * Callers supply measured or derived evidence; nothing is invented here.
 */
export type ObjectiveEvidence = Readonly<Record<StrategyObjective, number>>;
export declare const emptyObjectives: () => ObjectiveVector;
/** Uniform weighting, used when no compiled intent supplies preferences. */
export declare const uniformObjectives: () => ObjectiveVector;
/**
 * Projects a compiled intent's objectives onto the Section F objective set.
 * Expressed objectives share `(1 - RESIDUAL_SHARE)` of the budget in proportion
 * to their stated weight; unexpressed objectives share the remainder equally.
 * Weights always sum to 1, so scores stay comparable across intents.
 */
export declare const objectivesFromIntent: (intent: CompiledIntent | undefined, fallback?: ObjectiveVector) => ObjectiveVector;
/** Derived objective evidence for a candidate that exposes no measurements. */
export declare const defaultEvidenceFor: (candidate: Pick<CandidateAction, "expectedBenefit" | "risk" | "confidence">) => ObjectiveEvidence;
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
export declare const scoreCandidate: (candidate: CandidateAction, objectives: ObjectiveVector, evidence?: ObjectiveEvidence) => ScoredCandidate;
/**
 * Ranks candidates against intent-derived objectives.
 *
 * The comparator is total over candidate content, so the result does not depend
 * on the input order.
 */
export declare const rankByObjectives: (candidates: readonly CandidateAction[], objectives: ObjectiveVector, evidenceFor?: (candidate: CandidateAction) => ObjectiveEvidence) => readonly ScoredCandidate[];
//# sourceMappingURL=objectives.d.ts.map