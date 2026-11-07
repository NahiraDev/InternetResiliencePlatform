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
import { type ArbitratedEvidence } from './arbitration.js';
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
/**
 * Neutral evidence for objectives knowledge says nothing about. Knowledge may
 * only move an objective it actually measured; unmeasured objectives keep the
 * planner's own default so knowledge cannot silently dominate the score.
 */
export declare const neutralEvidence: () => ObjectiveEvidence;
/**
 * Merges arbitrated objective evidence into a neutral vector.
 * Only objectives present in the arbitration result are overridden.
 */
export declare const mergeKnowledgeEvidence: (base: ObjectiveEvidence, arbitrated: ArbitratedEvidence) => ObjectiveEvidence;
/**
 * Combines arbitrated knowledge with failure memory into a bounded influence.
 *
 * `candidateKey` identifies the strategy for failure-memory lookup; when it is
 * not a quarantine the multiplier stays at 1.
 */
export declare const knowledgeInfluenceFor: (input: {
    readonly base: ObjectiveEvidence;
    readonly arbitrated: ArbitratedEvidence;
    readonly failureMemory?: DecayingFailureMemory;
    readonly candidate: CandidateAction;
    readonly scope?: {
        destination?: string;
        providerId?: string;
    };
    readonly nowMs?: number;
    readonly candidateKey?: string;
}) => KnowledgeInfluence;
/**
 * Builds a knowledge-aware evidence function for the planner.
 *
 * The returned function satisfies the planner's `evidenceFor` contract, so
 * knowledge participates in canonical ranking without duplicating the planner
 * or creating a second decision path.
 */
export declare const knowledgeEvidenceFunction: (input: {
    readonly arbitrated: ArbitratedEvidence;
    readonly baseEvidenceFor: (candidate: CandidateAction) => ObjectiveEvidence;
    readonly influences?: Readonly<Record<string, KnowledgeInfluence>>;
    /**
     * Per-candidate arbitration. Knowledge is scoped by destination, provider and
     * path, so evidence for one strategy must not be applied to another. When
     * supplied this takes precedence over the shared `arbitrated` result.
     */
    readonly arbitratedFor?: (candidate: CandidateAction) => ArbitratedEvidence;
}) => ((candidate: CandidateAction) => ObjectiveEvidence);
//# sourceMappingURL=knowledge-influence.d.ts.map