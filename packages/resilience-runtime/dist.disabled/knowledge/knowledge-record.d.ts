/**
 * Unified knowledge boundary for issue #276 (issue #272 Section E).
 *
 * One evidence-backed record shape carries every kind of network intelligence.
 * The epistemic `kind` is mandatory so a prediction can never be read as an
 * observation, and a hypothesis can never be read as a measurement.
 *
 * Authority rule: knowledge is always advisory. A `KnowledgeRecord` can raise or
 * lower a candidate's objective score, but it can never grant mutation
 * authority, bypass policy, or mark a candidate as policy-allowed.
 */
import type { AuditFields } from '../domain/types.js';
/** The seven epistemic kinds required by issue #276 task 3. */
export declare const KNOWLEDGE_KINDS: readonly ["observation", "measurement", "inference", "hypothesis", "prediction", "decision", "outcome"];
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];
/** Evidence source families required by issue #276 task 1. */
export declare const KNOWLEDGE_SOURCES: readonly ["observation", "measurement", "topology", "history", "failure-memory", "destination", "provider", "federated"];
export type KnowledgeSource = (typeof KNOWLEDGE_SOURCES)[number];
/**
 * How strongly a source may be trusted relative to locally measured evidence.
 * This orders arbitration only; it never grants authority.
 */
export declare const SOURCE_TRUST_ORDER: Readonly<Record<KnowledgeSource, number>>;
/**
 * Remote/federated and historical knowledge may only ever adjust ranking.
 * Only locally measured evidence may inform operational state.
 */
export declare const isAdvisoryOnly: (source: KnowledgeSource) => boolean;
export interface KnowledgeProvenance {
    /** Component or agent that produced the knowledge. */
    readonly producer: string;
    readonly source: KnowledgeSource;
    /** Present for federated knowledge; verified by signature check before use. */
    readonly signature?: string | undefined;
    readonly trustLevel?: 'untrusted' | 'low' | 'medium' | 'high' | 'verified';
}
/**
 * Destination/provider scoping. Federated evidence must match the active
 * destination or it is ignored, so one destination's probes cannot influence
 * another destination's decision.
 */
export interface KnowledgeScope {
    readonly destination?: string | undefined;
    readonly providerId?: string | undefined;
    readonly pathId?: string | undefined;
    readonly region?: string | undefined;
}
export interface KnowledgeRecord extends AuditFields {
    readonly kind: KnowledgeKind;
    readonly source: KnowledgeSource;
    readonly provenance: KnowledgeProvenance;
    readonly scope: KnowledgeScope;
    /** When the underlying fact was observed (not when the record was created). */
    readonly observedAt: string;
    /** Absolute expiry; the record is unusable after this instant. */
    readonly expiresAt?: string | undefined;
    /** Half-life in ms used to decay confidence between `observedAt` and expiry. */
    readonly halfLifeMs?: number | undefined;
    /** Stated confidence in [0,1] at `observedAt`. */
    readonly confidence: number;
    /** Ids of independent records that corroborate this one. */
    readonly corroborations: readonly string[];
    /** Objective contributions in [0,1]; direction is intrinsic to the objective. */
    readonly objectiveEvidence?: Readonly<Partial<Record<string, number>>> | undefined;
    /** Free-form, non-authoritative detail. Never interpreted as a capability. */
    readonly detail?: Readonly<Record<string, string | number | boolean>> | undefined;
}
export declare class KnowledgeValidationError extends Error {
    constructor(message: string);
}
/**
 * Validates and constructs a knowledge record. Validation is strict and
 * deterministic: malformed knowledge is rejected rather than silently admitted,
 * because a bad record that reaches arbitration can distort ranking.
 */
export declare const createKnowledgeRecord: (input: {
    readonly kind: KnowledgeKind;
    readonly source: KnowledgeSource;
    readonly provenance: KnowledgeProvenance;
    readonly scope?: KnowledgeScope;
    readonly observedAt: string;
    readonly expiresAt?: string | undefined;
    readonly halfLifeMs?: number | undefined;
    readonly confidence: number;
    readonly corroborations?: readonly string[];
    readonly objectiveEvidence?: Readonly<Partial<Record<string, number>>> | undefined;
    readonly detail?: Readonly<Record<string, string | number | boolean>> | undefined;
    readonly correlationId: string;
}) => KnowledgeRecord;
/**
 * Time-decayed confidence. Records lose confidence exponentially as they age
 * toward their expiry, and are rejected once expired.
 */
export declare const decayedConfidence: (record: KnowledgeRecord, nowMs?: number) => number;
export declare const isExpired: (record: KnowledgeRecord, nowMs?: number) => boolean;
/**
 * Destination/provider scope match. An unscoped record matches any scope;
 * a scoped record matches only when every declared field agrees. This is the
 * guard that stops one destination's federated evidence from steering another.
 */
export declare const scopeMatches: (record: KnowledgeScope, active: KnowledgeScope) => boolean;
//# sourceMappingURL=knowledge-record.d.ts.map