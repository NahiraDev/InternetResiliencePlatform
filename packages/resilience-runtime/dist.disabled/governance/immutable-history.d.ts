/**
 * Phase 143 — Auditability & Immutable Control History.
 *
 * An append-only, hash-chained and HMAC-sealed history of control decisions.
 * Each entry commits to its predecessor, so any edit, deletion, reordering or
 * insertion is detected by `verify`. Signed checkpoints allow pruning of old
 * segments while keeping the remaining history verifiable.
 */
export interface HistoryEntry {
    readonly index: number;
    readonly atMs: number;
    readonly actor: string;
    readonly action: string;
    readonly subject: string;
    readonly outcome: 'allowed' | 'denied' | 'applied' | 'reverted' | 'failed';
    readonly detail: Readonly<Record<string, string | number | boolean>>;
    readonly previousHash: string;
    readonly hash: string;
    readonly seal: string;
}
export interface HistoryCheckpoint {
    readonly upToIndex: number;
    readonly hash: string;
    readonly atMs: number;
    readonly seal: string;
}
export type HistoryVerification = {
    readonly ok: true;
    readonly entries: number;
} | {
    readonly ok: false;
    readonly index: number;
    readonly reason: 'hash-mismatch' | 'chain-broken' | 'bad-seal' | 'index-gap' | 'checkpoint-mismatch';
};
export declare const GENESIS_HASH: string;
export declare class ImmutableHistory {
    private readonly sealKey;
    private readonly capacity;
    private entries;
    private base;
    constructor(sealKey: Buffer | string, capacity?: number);
    append(input: {
        readonly atMs: number;
        readonly actor: string;
        readonly action: string;
        readonly subject: string;
        readonly outcome: HistoryEntry['outcome'];
        readonly detail?: HistoryEntry['detail'];
    }): HistoryEntry;
    verify(entries?: readonly HistoryEntry[], anchor?: HistoryCheckpoint | undefined): HistoryVerification;
    /** Signs a checkpoint at the current head. */
    checkpoint(nowMs: number): HistoryCheckpoint;
    /** Drops entries up to and including the checkpoint; the remainder stays verifiable from it. */
    prune(cp: HistoryCheckpoint): number;
    all(): readonly HistoryEntry[];
    query(filter: {
        readonly actor?: string;
        readonly action?: string;
        readonly subject?: string;
        readonly sinceMs?: number;
        readonly untilMs?: number;
    }): readonly HistoryEntry[];
    head(): string;
}
//# sourceMappingURL=immutable-history.d.ts.map