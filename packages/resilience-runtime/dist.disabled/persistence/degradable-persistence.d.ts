/**
 * Persistence integration and database model auditing for issue #281
 * (issue #272 Section J, tasks 3 and 4).
 *
 * Task 4: persistence is integrated where required, but local recovery must not
 * depend on database availability. `DegradableStore` keeps an authoritative
 * in-memory mirror: reads always succeed, writes degrade to memory when the
 * database is unavailable, and the pending set is drained on recovery.
 *
 * Task 3: every important model is audited for producer, consumer, lifecycle,
 * retention, indexing and failure behaviour. A model that cannot answer all six
 * is registered as a finding rather than silently assumed correct.
 */
import type { StateClass } from '../state/state-classification.js';
export declare const MODEL_DIMENSIONS: readonly ["producer", "consumer", "lifecycle", "retention", "indexing", "failureBehavior"];
export type ModelDimension = (typeof MODEL_DIMENSIONS)[number];
export interface ModelAuditInput {
    readonly name: string;
    readonly stateClass: StateClass;
    readonly producer?: string;
    readonly consumer?: string;
    readonly lifecycle?: string;
    readonly retention?: string;
    readonly indexing?: readonly string[];
    readonly failureBehavior?: string;
}
export interface ModelAuditFinding {
    readonly model: string;
    readonly dimension: ModelDimension;
    readonly severity: 'MINOR' | 'MAJOR';
    readonly issue: string;
    readonly fix: string;
}
export interface ModelAuditResult {
    readonly models: readonly string[];
    readonly complete: readonly string[];
    readonly findings: readonly ModelAuditFinding[];
    readonly auditedDimensions: number;
}
/**
 * Audits declared models against all six required dimensions.
 *
 * A missing `retention` on a durable model is MAJOR, because unbounded growth
 * eventually takes down the process that must keep local control working. A
 * missing `failureBehavior` is MAJOR because it means the code does not know
 * what happens when the database is unavailable.
 */
export declare const auditModels: (models: readonly ModelAuditInput[]) => ModelAuditResult;
/** Remote persistence port. Failure is expected and must be survivable. */
export interface DegradablePersistence {
    load(key: string): Promise<unknown | undefined>;
    save(key: string, value: unknown): Promise<void>;
    remove(key: string): Promise<void>;
    /** True when the remote store is currently usable. */
    available(): boolean;
}
export interface DegradableStoreOptions {
    readonly persistence?: DegradablePersistence;
    readonly telemetry?: {
        increment(metric: string, value?: number): void;
    };
    /** Keys retained in the local mirror. */
    readonly maxLocalEntries?: number;
    /** Keys retained in the retry queue. Defaults to `maxLocalEntries`. */
    readonly maxPendingWrites?: number;
}
/**
 * A store whose local mirror is authoritative for reads.
 *
 * Reads never touch the database on the hot path, which is what guarantees local
 * recovery works while the database is down. Writes go to memory first, then to
 * the database; when the database fails the entry is queued in `pending` and
 * retried by `drain()`.
 */
export declare class DegradableStore {
    private readonly options;
    private readonly local;
    private readonly pendingWrites;
    private readonly maxLocalEntries;
    private readonly maxPendingWrites;
    private droppedWrites;
    constructor(options?: DegradableStoreOptions);
    /** Always succeeds: reads are served from the authoritative local mirror. */
    get(key: string): unknown;
    has(key: string): boolean;
    /** Local mirror first, then best-effort persistence. Never throws. */
    set(key: string, value: unknown): Promise<'persisted' | 'queued'>;
    /** Queues a write for retry, evicting the oldest entry when full. */
    private enqueue;
    remove(key: string): Promise<void>;
    pending(): readonly string[];
    pendingCount(): number;
    /**
     * Retries queued writes. Safe to call repeatedly; successful entries leave the
     * queue. Returns what remains, so the caller can observe unresolved loss.
     */
    drain(): Promise<readonly string[]>;
    /** Hydrates the local mirror from the database when it becomes available. */
    hydrate(keys: readonly string[]): Promise<number>;
    size(): number;
    snapshot(): {
        readonly localEntries: number;
        readonly pendingWrites: number;
        readonly remoteAvailable: boolean;
        readonly degraded: boolean;
        /** Retry entries evicted by the bounded queue during an outage. */
        readonly droppedWrites: number;
    };
    private count;
}
//# sourceMappingURL=degradable-persistence.d.ts.map