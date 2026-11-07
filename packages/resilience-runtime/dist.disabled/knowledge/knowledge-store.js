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
import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
import { createKnowledgeRecord, isExpired, } from './knowledge-record.js';
import { arbitrateKnowledge, } from './arbitration.js';
export class KnowledgeStore {
    records = new Map();
    maxRecords;
    clock;
    constructor(options = {}) {
        this.maxRecords = Math.max(1, Math.floor(options.maxRecords ?? 5000));
        this.clock = options.nowMs ?? (() => Date.now());
    }
    /** Admits a validated record, evicting the oldest when over capacity. */
    ingest(record) {
        this.records.set(record.id, record);
        if (this.records.size > this.maxRecords) {
            const ordered = [...this.records.values()].sort((a, b) => {
                const at = Date.parse(a.observedAt);
                const bt = Date.parse(b.observedAt);
                if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt)
                    return at - bt;
                return a.id.localeCompare(b.id);
            });
            for (const evicted of ordered.slice(0, this.records.size - this.maxRecords)) {
                this.records.delete(evicted.id);
            }
        }
        return record;
    }
    /**
     * Builds and admits a record. Validation failures throw rather than admitting
     * malformed knowledge.
     */
    record(input) {
        return this.ingest(createKnowledgeRecord(input));
    }
    size() {
        return this.records.size;
    }
    /** Removes expired records. Compaction is explicit; reading never deletes. */
    pruneExpired(nowMs = this.clock()) {
        let removed = 0;
        for (const record of [...this.records.values()]) {
            if (isExpired(record, nowMs)) {
                this.records.delete(record.id);
                removed += 1;
            }
        }
        return removed;
    }
    clear() {
        this.records.clear();
    }
    query(query = {}) {
        const nowMs = query.nowMs ?? this.clock();
        const results = [...this.records.values()].filter((record) => {
            if (isExpired(record, nowMs))
                return false;
            if (query.sources && !query.sources.includes(record.source))
                return false;
            return true;
        });
        return Object.freeze(results.sort((a, b) => {
            const at = Date.parse(b.observedAt);
            const bt = Date.parse(a.observedAt);
            if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt)
                return at - bt;
            return a.id.localeCompare(b.id);
        }));
    }
    /**
     * Arbitrates every record matching the query. Returns an empty result rather
     * than throwing, so an absent evidence family degrades ranking confidence but
     * never blocks a decision.
     */
    arbitrate(query = {}, options = {}) {
        const nowMs = query.nowMs ?? this.clock();
        return arbitrateKnowledge(this.query({ ...query, nowMs }), {
            ...options,
            ...(query.scope !== undefined ? { scope: query.scope } : {}),
            nowMs,
        });
    }
    snapshot() {
        const bySource = {};
        const byKind = {};
        for (const record of this.records.values()) {
            bySource[record.source] = (bySource[record.source] ?? 0) + 1;
            byKind[record.kind] = (byKind[record.kind] ?? 0) + 1;
        }
        return deepFreeze({
            recordCount: this.records.size,
            bySource: Object.freeze(bySource),
            byKind: Object.freeze(byKind),
        });
    }
}
/**
 * Records a local decision outcome as knowledge. Closes the loop from
 * verification back into the knowledge plane.
 */
export const recordOutcome = (store, input) => store.record({
    kind: 'outcome',
    source: 'measurement',
    provenance: { producer: input.producer, source: 'measurement', trustLevel: 'verified' },
    ...(input.scope !== undefined ? { scope: input.scope } : {}),
    observedAt: input.observedAt ?? nowIso(),
    confidence: input.confidence,
    corroborations: [],
    ...(input.objectiveEvidence !== undefined
        ? { objectiveEvidence: input.objectiveEvidence }
        : {}),
    ...(input.halfLifeMs !== undefined ? { halfLifeMs: input.halfLifeMs } : {}),
    correlationId: input.correlationId,
    detail: { succeeded: input.succeeded },
});
/** Convenience id generator so callers do not import two id helpers. */
export const knowledgeId = () => nextId('knowledge');
//# sourceMappingURL=knowledge-store.js.map