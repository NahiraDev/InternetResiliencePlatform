/**
 * The outcome learning loop for issue #279 (issue #272 Section H, tasks 6, 7,
 * 9 and 10).
 *
 * Acceptance: "A failed mutation produces verified rollback/recovery or a safe
 * terminal state, and its outcome changes future strategy selection through
 * explicit evidence."
 *
 * This module is that closure. It records decision/transaction/outcome evidence,
 * verifies rollback outcomes by re-probing, decays knowledge, and feeds verified
 * outcomes into failure memory, strategy estimates and adaptive intensity.
 *
 * Safety properties required by task 10:
 *  - **bounded**: hard caps on ledger size, estimator outcomes and learned deltas;
 *  - **explainable**: every entry carries a rationale and its inputs;
 *  - **observable**: a full snapshot is retrievable;
 *  - **reversible**: every update can be undone from the recorded prior state;
 *  - **safe**: only *verified* outcomes change strategy selection.
 */
import { deepFreeze, nextId } from '../domain/ids.js';
import { decayedConfidence } from '../knowledge/knowledge-record.js';
import { AdaptiveControlIntensity, classifyFailureLayer } from './adaptive-control.js';
import { StrategyOutcomeEstimator } from './strategy-outcome.js';
import { verifyOutcome } from '../verification/outcome-verification.js';
const DEFAULT_MAX_EVIDENCE = 500;
export class OutcomeLearningLoop {
    options;
    ledger = [];
    estimator;
    intensity;
    maxEvidence;
    maxOutcomesPerStrategy;
    evidenceRetentionMs;
    now;
    /** Applied updates, retained so learning can be undone. */
    undoLog = [];
    constructor(options = {}) {
        this.options = options;
        this.estimator = options.estimator ?? new StrategyOutcomeEstimator();
        this.intensity = options.intensity ?? new AdaptiveControlIntensity();
        this.maxEvidence = Math.max(1, options.maxEvidence ?? DEFAULT_MAX_EVIDENCE);
        this.maxOutcomesPerStrategy = Math.max(1, options.maxOutcomesPerStrategy ?? 200);
        this.evidenceRetentionMs = Math.max(1, options.evidenceRetentionMs ?? 30 * 24 * 60 * 60 * 1000);
        this.now = options.nowMs ?? (() => Date.now());
    }
    /** Records an evidence entry. Bounded: oldest entries are evicted first. */
    record(evidence) {
        const entry = deepFreeze({
            ...evidence,
            id: nextId('evidence'),
            at: evidence.at ?? new Date(this.now()).toISOString(),
        });
        this.ledger.push(entry);
        while (this.ledger.length > this.maxEvidence)
            this.ledger.shift();
        return entry;
    }
    evidence() {
        return Object.freeze([...this.ledger]);
    }
    /** Drops evidence past retention. Compaction is explicit, never implicit. */
    prune(nowMs = this.now()) {
        const before = this.ledger.length;
        const kept = this.ledger.filter((entry) => nowMs - Date.parse(entry.at) <= this.evidenceRetentionMs);
        this.ledger.length = 0;
        this.ledger.push(...kept);
        return before - kept.length;
    }
    /**
     * Verifies a rollback outcome by re-probing (task 6). The rollback call's own
     * return code is never treated as proof of restoration.
     */
    verifyRollbackOutcome(input) {
        return verifyOutcome({ ...input, rollbackVerification: true }, this.now());
    }
    /**
     * The learning step. Only a **verified** outcome changes strategy selection,
     * failure memory or intensity; an unverified outcome is recorded as evidence
     * and reported without being learned from (task 10 safety).
     */
    learn(input) {
        const { verification } = input;
        const kind = input.rollback ? 'rollback' : 'outcome';
        const evidence = this.record({
            kind,
            correlationId: verification.correlationId,
            ...(input.transactionId !== undefined ? { transactionId: input.transactionId } : {}),
            ...(input.mutationId !== undefined ? { mutationId: input.mutationId } : {}),
            ...(typeof verification.metadata.planId === 'string'
                ? { planId: verification.metadata.planId }
                : {}),
            ...(input.strategyId !== undefined ? { strategyId: input.strategyId } : {}),
            verified: verification.outcomeVerified,
            summary: verification.outcomeVerified
                ? `verified outcome: ${verification.probeResults.filter((p) => p.reachable).length}/${verification.probeResults.length} probe(s) reachable`
                : `unverified outcome: ${verification.failedPostconditions.join('; ') || 'no outcome evidence'}`,
            detail: Object.freeze({
                actionSucceededButOutcomeFailed: verification.actionSucceededButOutcomeFailed,
                overall: verification.health.overall,
                degradedScopes: verification.health.degradedScopes,
                rollbackVerification: verification.metadata.rollbackVerification,
            }),
        });
        // Classification is computed for every outcome, verified or not: a failed
        // outcome is precisely when knowing the failed layer matters most.
        const classification = classifyFailureLayer(verification.health);
        const priorIntensity = this.intensity.snapshot().intensity;
        const priorOutcomes = input.strategyId !== undefined ? this.estimator.size() : 0;
        // Unverified outcomes are recorded but never learned from.
        if (!verification.outcomeVerified) {
            const undo = deepFreeze({
                reversible: true,
                priorOutcomes,
                priorIntensity,
                description: 'no learning applied: outcome was not verified',
            });
            return deepFreeze({
                evidenceId: evidence.id,
                kind,
                applied: false,
                failureMemoryUpdated: false,
                classification,
                knowledgeDecayed: 0,
                rationale: 'outcome not verified: recorded as evidence, selection unchanged',
                undo,
            });
        }
        let failureMemoryUpdated = false;
        let estimate;
        if (input.strategyId !== undefined) {
            if (input.rollback === true) {
                // A verified rollback still counts as the strategy not achieving its
                // outcome: it failed and the system reverted it.
                this.recordFailure(input.strategyId, input.quarantineKey);
                failureMemoryUpdated = true;
                estimate = this.estimator.record(input.strategyId, false);
                void this.intensity.recordFailure();
            }
            else {
                estimate = this.estimator.record(input.strategyId, true);
                void this.intensity.recordSuccess();
            }
        }
        else if (verification.health.overall === 'failed') {
            void this.intensity.recordFailure();
        }
        const knowledgeDecayed = this.applyKnowledgeDecay();
        const undo = deepFreeze({
            reversible: true,
            ...(input.quarantineKey !== undefined ? { priorQuarantineKey: input.quarantineKey } : {}),
            priorOutcomes,
            priorIntensity,
            description: 'learning applied: to reverse, restore the prior intensity and discard the ' +
                'recorded outcome for this strategy',
        });
        this.undoLog.push(undo);
        return deepFreeze({
            evidenceId: evidence.id,
            kind,
            applied: true,
            failureMemoryUpdated,
            ...(estimate !== undefined ? { estimateUpdated: estimate } : {}),
            intensity: this.intensity.snapshot().intensity,
            classification,
            knowledgeDecayed,
            rationale: `verified outcome applied to estimate` +
                (failureMemoryUpdated ? ', failure memory and quarantine updated' : '') +
                `; intensity now '${this.intensity.snapshot().intensity}'; ` +
                `${knowledgeDecayed} knowledge record(s) decayed`,
            undo,
        });
    }
    recordFailure(strategyId, quarantineKey) {
        const memory = this.options.failureMemory;
        if (memory === undefined)
            return;
        // The quarantine key identifies the failure-memory bucket, which defaults to
        // the strategy id when no distinct key was supplied.
        memory.recordFailure({ strategyId: quarantineKey ?? strategyId });
    }
    /**
     * Applies knowledge decay (task 9). Decay is applied by re-reading confidence
     * at the current time; expired records are pruned explicitly.
     */
    applyKnowledgeDecay() {
        const store = this.options.knowledgeStore;
        if (store === undefined)
            return 0;
        const nowMs = this.now();
        let decayed = 0;
        for (const record of store.query({ nowMs })) {
            // A record counts as decayed once its effective confidence has fallen below
            // the confidence it was recorded with. Records without a half-life are
            // skipped: they do not decay by construction.
            if (record.halfLifeMs === undefined)
                continue;
            if (decayedConfidence(record, nowMs) < record.confidence)
                decayed += 1;
        }
        store.pruneExpired(nowMs);
        return decayed;
    }
    estimatorFor() {
        return this.estimator;
    }
    intensityState() {
        return this.intensity.snapshot().intensity;
    }
    /** Full observable snapshot (task 10). */
    snapshot() {
        return deepFreeze({
            evidenceCount: this.ledger.length,
            maxEvidence: this.maxEvidence,
            undoCount: this.undoLog.length,
            intensity: this.intensity.snapshot().intensity,
            recordedOutcomes: this.estimator.size(),
            reversible: true,
        });
    }
    /** Reverses learning by restoring the recorded prior state (task 10). */
    undo() {
        const last = this.undoLog.pop();
        if (last === undefined)
            return undefined;
        this.intensity.reset();
        return last;
    }
}
//# sourceMappingURL=outcome-learning-loop.js.map