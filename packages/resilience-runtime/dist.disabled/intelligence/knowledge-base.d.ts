/**
 * Phase 121 — Network Knowledge Base.
 *
 * Entity-centric query layer over the existing `KnowledgeStore`. It adds no new
 * store: records are admitted, decayed, expired and arbitrated by the canonical
 * knowledge plane. The knowledge base answers "what do we know about this
 * destination / provider / path" with provenance, confidence and failure memory.
 */
import { type KnowledgeRecord } from '../knowledge/knowledge-record.js';
import type { KnowledgeStore } from '../knowledge/knowledge-store.js';
export type EntityKind = 'destination' | 'provider' | 'path' | 'region';
export interface EntityRef {
    readonly kind: EntityKind;
    readonly id: string;
}
export interface EntityProfile {
    readonly entity: EntityRef;
    readonly recordCount: number;
    readonly bySource: Readonly<Record<string, number>>;
    readonly byKind: Readonly<Record<string, number>>;
    /** Confidence-weighted mean of the named objective's evidence in [0,1]. */
    readonly objectiveEvidence: Readonly<Record<string, number>>;
    readonly meanConfidence: number;
    readonly newestObservedAt?: string;
    readonly advisoryOnlyRatio: number;
    readonly failureSignals: number;
    readonly corroborated: number;
}
export declare class NetworkKnowledgeBase {
    private readonly store;
    private readonly clock;
    constructor(store: KnowledgeStore, clock?: () => number);
    /** Live (non-expired) records whose declared scope matches the entity. */
    factsFor(entity: EntityRef, nowMs?: number): readonly KnowledgeRecord[];
    profile(entity: EntityRef, nowMs?: number): EntityProfile;
    /** Entities of a kind ranked by failure signals then recency; useful for "where do we keep failing". */
    rankByFailures(kind: EntityKind, nowMs?: number, limit?: number): readonly EntityProfile[];
    /** Human-readable, provenance-bearing explanation suitable for operators and audit. */
    explain(entity: EntityRef, nowMs?: number): string;
}
//# sourceMappingURL=knowledge-base.d.ts.map