/**
 * Knowledge store for issue #276 (task 1).
 *
 * One boundary combining every evidence family: local observations,
 * measurements, topology, history, failure memory, destination/provider
 * knowledge and federated evidence.
 *
 * Fail-safe behaviour (task 9): the store never blocks a decision. If federation
 * or history is unavailable the store simply has no records for that family, and
 * local ranking proceeds on locally measured evidence alone.
 */
import { type KnowledgeRecord, type KnowledgeScope, type KnowledgeSource, createKnowledgeRecord } from './knowledge-record.js';
import { type ArbitrationOptions, type ArbitratedEvidence } from './arbitration.js';
export interface KnowledgeStoreOptions {
    /** Hard cap on retained records; oldest are evicted first. */
    readonly maxRecords?: number;
    readonly nowMs?: () => number;
}
export interface KnowledgeQuery {
    readonly scope?: KnowledgeScope;
    readonly sources?: readonly KnowledgeSource[];
    readonly nowMs?: number;
}
export interface KnowledgeStoreSnapshot {
    readonly recordCount: number;
    readonly bySource: Readonly<Record<string, number>>;
    readonly byKind: Readonly<Record<string, number>>;
}
export declare class KnowledgeStore {
    private readonly records;
    private readonly maxRecords;
    private readonly clock;
    constructor(options?: KnowledgeStoreOptions);
    /** Admits a validated record, evicting the oldest when over capacity. */
    ingest(record: KnowledgeRecord): KnowledgeRecord;
    /**
     * Builds and admits a record. Validation failures throw rather than admitting
     * malformed knowledge.
     */
    record(input: Parameters<typeof createKnowledgeRecord>[0]): KnowledgeRecord;
    size(): number;
    /** Removes expired records. Compaction is explicit; reading never deletes. */
    pruneExpired(nowMs?: number): number;
    clear(): void;
    query(query?: KnowledgeQuery): readonly KnowledgeRecord[];
    /**
     * Arbitrates every record matching the query. Returns an empty result rather
     * than throwing, so an absent evidence family degrades ranking confidence but
     * never blocks a decision.
     */
    arbitrate(query?: KnowledgeQuery, options?: Omit<ArbitrationOptions, 'scope' | 'nowMs'>): ArbitratedEvidence;
    snapshot(): KnowledgeStoreSnapshot;
}
/**
 * Records a local decision outcome as knowledge. Closes the loop from
 * verification back into the knowledge plane.
 */
export declare const recordOutcome: (store: KnowledgeStore, input: {
    readonly correlationId: string;
    readonly scope?: KnowledgeScope;
    readonly producer: string;
    readonly succeeded: boolean;
    readonly confidence: number;
    readonly objectiveEvidence?: Readonly<Partial<Record<string, number>>>;
    readonly halfLifeMs?: number;
    readonly observedAt?: string;
}) => KnowledgeRecord;
/** Convenience id generator so callers do not import two id helpers. */
export declare const knowledgeId: () => string;
//# sourceMappingURL=knowledge-store.d.ts.map