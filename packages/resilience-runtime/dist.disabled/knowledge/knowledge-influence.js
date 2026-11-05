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
import { STRATEGY_OBJECTIVES } from '../planning/objectives.js';
import { explainArbitration } from './arbitration.js';
const clamp01 = (value) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
/**
 * Neutral evidence for objectives knowledge says nothing about. Knowledge may
 * only move an objective it actually measured; unmeasured objectives keep the
 * planner's own default so knowledge cannot silently dominate the score.
 */
export const neutralEvidence = () => Object.freeze(Object.fromEntries(STRATEGY_OBJECTIVES.map((objective) => [objective, 0.5])));
/**
 * Merges arbitrated objective evidence into a neutral vector.
 * Only objectives present in the arbitration result are overridden.
 */
export const mergeKnowledgeEvidence = (base, arbitrated) => {
    const merged = {};
    for (const objective of STRATEGY_OBJECTIVES) {
        const value = arbitrated.evidence[objective];
        merged[objective] = value === undefined ? (base[objective] ?? 0.5) : clamp01(value);
    }
    // Knowledge may legitimately carry an objective outside the planner's set; it
    // is ignored rather than smuggled into the score.
    return Object.freeze(merged);
};
/**
 * Combines arbitrated knowledge with failure memory into a bounded influence.
 *
 * `candidateKey` identifies the strategy for failure-memory lookup; when it is
 * not a quarantine the multiplier stays at 1.
 */
export const knowledgeInfluenceFor = (input) => {
    const objectiveEvidence = mergeKnowledgeEvidence(input.base, input.arbitrated);
    const strategyId = input.candidateKey ??
        (typeof input.candidate.metadata.quarantineKey === 'string'
            ? input.candidate.metadata.quarantineKey
            : undefined);
    let scoreMultiplier = 1;
    let quarantineNote = '';
    if (input.failureMemory !== undefined && strategyId !== undefined) {
        const multiplier = input.failureMemory.scoreMultiplier(strategyId, input.scope ?? {}, input.nowMs);
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
export const knowledgeEvidenceFunction = (input) => {
    return (candidate) => {
        const influence = input.influences?.[candidate.id];
        if (influence)
            return influence.objectiveEvidence;
        const arbitrated = input.arbitratedFor?.(candidate) ?? input.arbitrated;
        return mergeKnowledgeEvidence(input.baseEvidenceFor(candidate), arbitrated);
    };
};
//# sourceMappingURL=knowledge-influence.js.map