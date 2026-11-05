/**
 * Deterministic evidence/confidence arbitration for issue #276 (task 4).
 *
 * Several records may assert the same objective. Arbitration must be
 * deterministic (same inputs always yield the same result), explainable (every
 * contribution is retained) and fail-safe (expired, untrusted or unscoped
 * evidence is discarded rather than trusted).
 *
 * Arbitration only produces objective evidence. It cannot allow a candidate,
 * grant a capability or bypass policy.
 */
import { type KnowledgeRecord, type KnowledgeSource, type KnowledgeScope } from './knowledge-record.js';
export type ArbitrationRejection = 'expired' | 'scope-mismatch' | 'untrusted-federation' | 'unsigned-federation' | 'no-evidence' | 'non-finite-evidence';
export interface ArbitrationContribution {
    readonly knowledgeId: string;
    readonly objective: string;
    readonly value: number;
    readonly weight: number;
    readonly source: KnowledgeSource;
    readonly kind: KnowledgeRecord['kind'];
    readonly advisoryOnly: boolean;
}
export interface ArbitrationRejectionRecord {
    readonly knowledgeId: string;
    readonly reason: ArbitrationRejection;
}
export interface ArbitratedEvidence {
    /** Objective -> aggregated value in [0,1]. */
    readonly evidence: Readonly<Record<string, number>>;
    /** Objective -> summed weight, so confidence is auditable. */
    readonly weights: Readonly<Record<string, number>>;
    readonly contributions: readonly ArbitrationContribution[];
    readonly rejected: readonly ArbitrationRejectionRecord[];
    /** Fraction of accepted evidence that came from advisory-only sources. */
    readonly advisoryShare: number;
}
export interface ArbitrationOptions {
    /** Active scope; records outside it are rejected. */
    readonly scope?: KnowledgeScope;
    readonly nowMs?: number;
    /**
     * Corroboration bonus per independent corroborating record. Applied only to
     * the objective weight, never to the value, so corroboration cannot invent
     * a favourable measurement.
     */
    readonly corroborationBonus?: number;
    /**
     * Require federated evidence to carry a signature. Defaults to true: unsigned
     * remote knowledge is never admitted.
     */
    readonly requireFederationSignature?: boolean;
}
/**
 * Aggregates objective evidence from knowledge records.
 *
 * Weighting per record is `decayedConfidence x sourceTrust x corroborationFactor`.
 * Values are combined as a weighted mean, so a single very confident record can
 * move the result but cannot dominate without corroboration.
 */
export declare const arbitrateKnowledge: (records: readonly KnowledgeRecord[], options?: ArbitrationOptions) => ArbitratedEvidence;
/**
 * Human-readable explanation of an arbitration result, retained in decision
 * records so a ranking decision can always be traced back to its evidence.
 */
export declare const explainArbitration: (result: ArbitratedEvidence) => string;
//# sourceMappingURL=arbitration.d.ts.map