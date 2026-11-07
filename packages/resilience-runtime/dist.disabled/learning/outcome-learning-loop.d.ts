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
import type { KnowledgeStore } from '../knowledge/knowledge-store.js';
import type { DecayingFailureMemory } from '../knowledge/failure-memory.js';
import { AdaptiveControlIntensity, type ControlIntensity, type FailureClassification } from './adaptive-control.js';
import { StrategyOutcomeEstimator, type StrategyEstimate } from './strategy-outcome.js';
import { verifyOutcome, type OutcomeVerificationResult } from '../verification/outcome-verification.js';
export type EvidenceKind = 'decision' | 'transaction' | 'outcome' | 'rollback';
export interface OutcomeEvidence {
    readonly id: string;
    readonly kind: EvidenceKind;
    readonly at: string;
    readonly correlationId: string;
    readonly transactionId?: string;
    readonly mutationId?: string;
    readonly planId?: string;
    readonly strategyId?: string;
    readonly verified: boolean;
    readonly summary: string;
    readonly detail: Readonly<Record<string, unknown>>;
}
export interface LearningUpdate {
    readonly evidenceId: string;
    readonly kind: EvidenceKind;
    readonly applied: boolean;
    readonly failureMemoryUpdated: boolean;
    readonly estimateUpdated?: StrategyEstimate;
    readonly intensity?: ControlIntensity;
    readonly classification?: FailureClassification;
    readonly knowledgeDecayed: number;
    readonly rationale: string;
    /** Prior state captured so the update can be reversed. */
    readonly undo: LearningUndo;
}
export interface LearningUndo {
    readonly reversible: true;
    readonly priorQuarantineKey?: string;
    readonly priorOutcomes: number;
    readonly priorIntensity?: ControlIntensity;
    readonly description: string;
}
export interface LearningLoopOptions {
    readonly estimator?: StrategyOutcomeEstimator;
    readonly intensity?: AdaptiveControlIntensity;
    readonly failureMemory?: DecayingFailureMemory;
    readonly knowledgeStore?: KnowledgeStore;
    /** Maximum retained evidence entries. */
    readonly maxEvidence?: number;
    /** Maximum recorded outcomes per strategy in the estimator. */
    readonly maxOutcomesPerStrategy?: number;
    /** Evidence older than this is dropped from the ledger. */
    readonly evidenceRetentionMs?: number;
    readonly nowMs?: () => number;
}
export declare class OutcomeLearningLoop {
    private readonly options;
    private readonly ledger;
    private readonly estimator;
    private readonly intensity;
    private readonly maxEvidence;
    private readonly maxOutcomesPerStrategy;
    private readonly evidenceRetentionMs;
    private readonly now;
    /** Applied updates, retained so learning can be undone. */
    private readonly undoLog;
    constructor(options?: LearningLoopOptions);
    /** Records an evidence entry. Bounded: oldest entries are evicted first. */
    record(evidence: Omit<OutcomeEvidence, 'id' | 'at'> & {
        readonly at?: string;
    }): OutcomeEvidence;
    evidence(): readonly OutcomeEvidence[];
    /** Drops evidence past retention. Compaction is explicit, never implicit. */
    prune(nowMs?: number): number;
    /**
     * Verifies a rollback outcome by re-probing (task 6). The rollback call's own
     * return code is never treated as proof of restoration.
     */
    verifyRollbackOutcome(input: Parameters<typeof verifyOutcome>[0]): Promise<OutcomeVerificationResult>;
    /**
     * The learning step. Only a **verified** outcome changes strategy selection,
     * failure memory or intensity; an unverified outcome is recorded as evidence
     * and reported without being learned from (task 10 safety).
     */
    learn(input: {
        readonly verification: OutcomeVerificationResult;
        readonly transactionId?: string;
        readonly mutationId?: string;
        readonly strategyId?: string;
        readonly quarantineKey?: string;
        /** Rollback outcomes are failures of the strategy that was rolled back. */
        readonly rollback?: boolean;
    }): LearningUpdate;
    private recordFailure;
    /**
     * Applies knowledge decay (task 9). Decay is applied by re-reading confidence
     * at the current time; expired records are pruned explicitly.
     */
    private applyKnowledgeDecay;
    estimatorFor(): StrategyOutcomeEstimator;
    intensityState(): ControlIntensity;
    /** Full observable snapshot (task 10). */
    snapshot(): {
        readonly evidenceCount: number;
        readonly maxEvidence: number;
        readonly undoCount: number;
        readonly intensity: ControlIntensity;
        readonly recordedOutcomes: number;
        readonly reversible: true;
    };
    /** Reverses learning by restoring the recorded prior state (task 10). */
    undo(): LearningUndo | undefined;
}
//# sourceMappingURL=outcome-learning-loop.d.ts.map