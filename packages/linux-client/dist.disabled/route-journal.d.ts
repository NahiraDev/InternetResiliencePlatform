/**
 * Crash-safe journal for route mutations.
 *
 * `LinuxRouteExecutor` captures a pre-mutation snapshot so a failed or unverified change can
 * be undone. Held only in memory, that snapshot is lost if the process dies between the
 * `ip route replace` and its verification, leaving the host with a route nobody can roll back.
 * The journal writes the snapshot and the exact rollback command to disk *before* the kernel
 * is touched, so a restarted process can finish or undo the interrupted mutation.
 *
 * Durability: each entry is written to a temporary file, fsynced, atomically renamed into
 * place and the directory is fsynced, so a reader never observes a partial entry.
 */
import type { RouteSnapshot } from './linux-route-executor.js';
export type RouteJournalState = 'applying' | 'verified';
export interface RouteJournalEntry {
    readonly schemaVersion: 1;
    readonly planId: string;
    readonly state: RouteJournalState;
    readonly snapshot: RouteSnapshot;
    /**
     * Ordered `ip` argument vectors that undo the mutation. Computed before the mutation is
     * issued, so recovery never has to re-derive intent from a plan that no longer exists.
     */
    readonly rollbackCommands: readonly (readonly string[])[];
    readonly updatedAt: string;
}
export interface RouteJournal {
    write(entry: RouteJournalEntry): void;
    remove(planId: string): void;
    list(): {
        readonly entries: readonly RouteJournalEntry[];
        readonly corrupt: readonly string[];
    };
}
/** Non-durable journal: the previous in-memory behaviour, for tests and explicit opt-out. */
export declare class MemoryRouteJournal implements RouteJournal {
    private readonly entries;
    write(entry: RouteJournalEntry): void;
    remove(planId: string): void;
    list(): {
        entries: RouteJournalEntry[];
        corrupt: string[];
    };
}
export declare class FileRouteJournal implements RouteJournal {
    private readonly directory;
    constructor(directory: string);
    write(entry: RouteJournalEntry): void;
    remove(planId: string): void;
    list(): {
        readonly entries: readonly RouteJournalEntry[];
        readonly corrupt: readonly string[];
    };
    private syncDirectory;
}
