/**
 * Phase 147 — Distributed State Consistency & Conflict Recovery.
 *
 * Version vectors detect concurrent writes precisely; non-concurrent updates
 * resolve by causality, concurrent ones by an explicit, deterministic policy
 * (never silently by wall clock alone) and are always reported as conflicts.
 * Also provides a grow/shrink-safe observed-remove set for replicated membership.
 */
export type VersionVector = Readonly<Record<string, number>>;
export type CausalOrder = 'equal' | 'before' | 'after' | 'concurrent';
export declare const compareVectors: (a: VersionVector, b: VersionVector) => CausalOrder;
export declare const mergeVectors: (a: VersionVector, b: VersionVector) => VersionVector;
export declare const bump: (v: VersionVector, replica: string) => VersionVector;
export interface Versioned<T> {
    readonly value: T;
    readonly vector: VersionVector;
    readonly writer: string;
    readonly atMs: number;
}
export interface ConflictRecord<T> {
    readonly key: string;
    readonly a: Versioned<T>;
    readonly b: Versioned<T>;
    readonly resolvedTo: 'a' | 'b';
    readonly policy: string;
}
export type ConflictPolicy<T> = (a: Versioned<T>, b: Versioned<T>) => 'a' | 'b';
/** Deterministic default: later timestamp wins, ties broken by writer id; the loss is reported, never silent. */
export declare const lastWriterWins: <T>(a: Versioned<T>, b: Versioned<T>) => "a" | "b";
export declare class ReplicatedMap<T> {
    readonly replicaId: string;
    private readonly policy;
    private readonly policyName;
    private readonly conflictCapacity;
    private readonly data;
    readonly conflicts: ConflictRecord<T>[];
    constructor(replicaId: string, policy?: ConflictPolicy<T>, policyName?: string, conflictCapacity?: number);
    set(key: string, value: T, nowMs: number): Versioned<T>;
    get(key: string): T | undefined;
    entry(key: string): Versioned<T> | undefined;
    snapshot(): Readonly<Record<string, Versioned<T>>>;
    /** Merges a remote snapshot; returns the keys whose local value changed. Idempotent, commutative and associative. */
    merge(remote: Readonly<Record<string, Versioned<T>>>): readonly string[];
}
/** Observed-remove set: concurrent add and remove of the same element resolve to "present" (add wins). */
export declare class ObservedRemoveSet {
    readonly replicaId: string;
    private readonly adds;
    private readonly tombstones;
    private counter;
    constructor(replicaId: string);
    add(element: string): string;
    remove(element: string): void;
    has(element: string): boolean;
    elements(): readonly string[];
    state(): {
        readonly adds: Readonly<Record<string, readonly string[]>>;
        readonly tombstones: readonly string[];
    };
    merge(other: ReturnType<ObservedRemoveSet['state']>): void;
}
//# sourceMappingURL=consistency.d.ts.map