/**
 * Strategy outcome estimation and alternate selection for issue #279
 * (issue #272 Section H, tasks 5 and 8).
 *
 * Task 8: maintain per-strategy success/failure estimates that decay, so a
 * strategy's worth reflects recent verified evidence rather than all history.
 *
 * Task 5: when a strategy fails, select an *alternate* rather than retrying.
 * Selection is bounded and explainable, and a quarantined strategy is never
 * returned while an eligible alternative exists.
 */
import { deepFreeze } from '../domain/ids.js';
/** Prior equivalent to two unobserved outcomes favouring success. */
const PRIOR_ALPHA = 2;
const PRIOR_BETA = 1;
const MIN_OUTCOMES_FOR_CONFIDENCE = 5;
/**
 * Decaying success/failure estimator per strategy.
 *
 * Implements decayed weighted Beta estimation: rather than forgetting old
 * outcomes entirely, each outcome's weight decays by half per half-life. This
 * keeps the estimate responsive to recent reality without discarding history
 * outright.
 */
export class StrategyOutcomeEstimator {
    outcomes = new Map();
    halfLifeMs;
    now;
    constructor(options = {}) {
        this.halfLifeMs = Math.max(1, options.halfLifeMs ?? 7 * 24 * 60 * 60 * 1000);
        this.now = options.nowMs ?? (() => Date.now());
    }
    /** Records a verified outcome. Unverified outcomes must not be recorded. */
    record(strategyId, success, atMs = this.now()) {
        const existing = this.outcomes.get(strategyId) ?? [];
        existing.push({ success, weight: 1, atMs });
        this.outcomes.set(strategyId, existing);
        return this.estimate(strategyId);
    }
    estimate(strategyId) {
        const outcomes = this.outcomes.get(strategyId) ?? [];
        const nowMs = this.now();
        let alpha = PRIOR_ALPHA;
        let beta = PRIOR_BETA;
        for (const outcome of outcomes) {
            const ageMs = Math.max(0, nowMs - outcome.atMs);
            const decay = Math.pow(0.5, ageMs / this.halfLifeMs);
            if (outcome.success)
                alpha += decay;
            else
                beta += decay;
        }
        return deepFreeze({
            strategyId,
            alpha,
            beta,
            successRate: alpha / (alpha + beta),
            verifiedOutcomes: outcomes.length,
            lastUpdatedAt: new Date(nowMs).toISOString(),
            // Confidence is gated on how many verified outcomes exist, not on decayed
            // weight: mixing a decayed total against a count threshold made the flag
            // flip whenever the clock advanced between record and estimate. Decay
            // already influences `successRate`.
            lowConfidence: outcomes.length < MIN_OUTCOMES_FOR_CONFIDENCE,
        });
    }
    /** Drops outcomes older than `retentionMs`. Compaction is explicit. */
    prune(retentionMs, nowMs = this.now()) {
        let removed = 0;
        for (const [id, outcomes] of this.outcomes) {
            const kept = outcomes.filter((outcome) => nowMs - outcome.atMs <= retentionMs);
            removed += outcomes.length - kept.length;
            if (kept.length === 0)
                this.outcomes.delete(id);
            else
                this.outcomes.set(id, kept);
        }
        return removed;
    }
    /** Total decayed evidence, used to bound the estimator's memory. */
    size() {
        let total = 0;
        for (const outcomes of this.outcomes.values())
            total += outcomes.length;
        return total;
    }
}
/**
 * Selects an alternate strategy after a failure.
 *
 * Order of preference:
 *  1. never the strategy that just failed (blind retry is excluded);
 *  2. never a quarantined strategy while an eligible one exists;
 *  3. among the rest, highest decayed success estimate.
 *
 * Returns `selected: undefined` when nothing eligible remains, which is the
 * honest answer: the runtime should stop acting rather than pick the least-bad
 * failing option.
 */
export const selectAlternateStrategy = (input) => {
    const rejected = [];
    const eligible = [];
    for (const candidate of input.candidates) {
        if (candidate.id === input.failed.id || candidate.alreadyFailed) {
            rejected.push({ id: candidate.id, reason: 'already-failed' });
            continue;
        }
        const key = candidate.quarantineKey ?? candidate.id;
        if (input.quarantined?.has(key)) {
            rejected.push({ id: candidate.id, reason: 'quarantined' });
            continue;
        }
        eligible.push({
            candidate,
            estimate: input.estimator?.estimate(candidate.id).successRate ?? PRIOR_ALPHA / (PRIOR_ALPHA + PRIOR_BETA),
        });
    }
    if (eligible.length === 0) {
        return deepFreeze({
            rejected: Object.freeze([
                ...rejected,
                { id: input.failed.id, reason: 'no-alternate-available' },
            ]),
            rationale: 'no eligible alternate: refusing to retry the failed strategy',
        });
    }
    // Prefer an alternate layer when the classifier suggested moving outward.
    const preferred = input.preferredLayer;
    const layered = preferred !== undefined
        ? eligible.filter((entry) => entry.candidate.targetLayer === preferred)
        : eligible;
    const pool = layered.length > 0 ? layered : eligible;
    const sorted = [...pool].sort((a, b) => b.estimate - a.estimate ||
        (a.candidate.targetLayer ?? '').localeCompare(b.candidate.targetLayer ?? '') ||
        a.candidate.id.localeCompare(b.candidate.id));
    const winner = sorted[0];
    for (const entry of sorted.slice(1)) {
        rejected.push({ id: entry.candidate.id, reason: 'lower-estimate' });
    }
    return deepFreeze({
        selected: winner.candidate,
        rejected: Object.freeze(rejected),
        rationale: `selected '${winner.candidate.id}' (estimate ${winner.estimate.toFixed(3)}) over ` +
            `${sorted.length - 1} alternate(s); failed strategy '${input.failed.id}' excluded` +
            (preferred !== undefined && layered.length > 0 ? `; layer preference '${preferred}' honoured` : ''),
    });
};
//# sourceMappingURL=strategy-outcome.js.map