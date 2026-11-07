/**
 * Durable, file-backed implementations of the runtime's decision and incident ports.
 *
 * The in-memory stores lose every decision and incident on restart, so an operator could not
 * answer "what did the runtime do before it crashed?". These stores append one JSON line per
 * record and fsync before `put` resolves, so an acknowledged record survives power loss.
 *
 * Failure model:
 * - A torn final line (crash mid-append) is dropped on open and counted, never fatal.
 * - A corrupt line in the middle is skipped and counted; the rest of the log still loads.
 * - Growth is bounded: once the log holds twice `maxRecords` lines it is compacted to the newest
 *   `maxRecords` records through a temp file and an atomic rename.
 *
 * They add no authority: they implement the same ports as the in-memory stores.
 */
import type { DecisionRecord, Incident } from '../domain/types.js';
import type { DecisionStore, IncidentStore } from '../ports/ports.js';
export interface DurableLogStatus {
    readonly path: string;
    readonly records: number;
    readonly skippedCorruptLines: number;
    readonly droppedTornTail: boolean;
    readonly compactions: number;
}
export interface DurableLogOptions {
    /** Newest records retained after compaction. Default 10 000. */
    readonly maxRecords?: number;
}
export declare class FileDecisionStore implements DecisionStore {
    private readonly log;
    constructor(path: string, options?: DurableLogOptions);
    put(record: DecisionRecord): Promise<void>;
    list(): Promise<readonly DecisionRecord[]>;
    get(id: string): Promise<DecisionRecord | undefined>;
    status(): DurableLogStatus;
    close(): void;
}
export declare class FileIncidentStore implements IncidentStore {
    private readonly log;
    constructor(path: string, options?: DurableLogOptions);
    put(incident: Incident): Promise<void>;
    list(): Promise<readonly Incident[]>;
    status(): DurableLogStatus;
    close(): void;
}
//# sourceMappingURL=file-stores.d.ts.map