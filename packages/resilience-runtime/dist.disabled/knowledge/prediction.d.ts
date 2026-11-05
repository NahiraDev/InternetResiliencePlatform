/**
 * Predictive signals for issue #276 (task 7).
 *
 * A prediction always declares a confidence and a time horizon, and is
 * deliberately kept distinguishable from observation and measurement: a
 * prediction can inform ranking, but it can never be promoted into measured
 * state or used as proof that a mutation succeeded.
 */
import { type KnowledgeRecord } from './knowledge-record.js';
export type PredictiveDirection = 'degrading' | 'stable' | 'improving';
export interface PredictiveSignal {
    readonly subjectId: string;
    readonly direction: PredictiveDirection;
    readonly confidence: number;
    /** Length of the prediction window in ms. */
    readonly horizonMs: number;
    /** Instant the prediction covers, i.e. now + horizon. */
    readonly horizonEnd: string;
    /** Objective evidence contributed while the prediction remains valid. */
    readonly objectiveEvidence: Readonly<Record<string, number>>;
    readonly rationale: string;
}
export interface PredictorOptions {
    /** Minimum confidence required before a prediction is admissible. */
    readonly minConfidence?: number;
    /** Maximum horizon a caller is willing to act on. */
    readonly maxHorizonMs?: number;
}
/**
 * Fuses several decayed signals into one consensus prediction.
 *
 * Weighted by decayed confidence, so stale signals fade out. Returns `undefined`
 * when no signal clears `minConfidence`, rather than inventing a weak prediction.
 */
export declare const fusePredictions: (records: readonly KnowledgeRecord[], options?: PredictorOptions & {
    readonly subjectId?: string;
    readonly nowMs?: number;
}) => PredictiveSignal | undefined;
/**
 * Builds a prediction record. Predictions must declare an expiry so they cannot
 * silently become permanent knowledge.
 */
export declare const predictiveSignalRecord: (input: {
    readonly subjectId: string;
    readonly destination?: string;
    readonly providerId?: string;
    readonly pathId?: string;
    readonly direction: PredictiveDirection;
    readonly confidence: number;
    readonly horizonMs: number;
    readonly producer: string;
    readonly correlationId: string;
    readonly objectiveEvidence?: Readonly<Partial<Record<string, number>>>;
    readonly nowMs?: number;
}) => KnowledgeRecord;
//# sourceMappingURL=prediction.d.ts.map