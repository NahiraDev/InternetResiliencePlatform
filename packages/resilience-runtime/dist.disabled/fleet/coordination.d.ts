/**
 * Phase 117 — Distributed Control & Coordination.
 *
 * Lease-based leadership with fencing tokens over an injected compare-and-set
 * store. Every granted lease carries a strictly increasing fencing token; a
 * holder presents it with each privileged operation and `assertFence` rejects
 * stale tokens. The token maps onto the privileged boundary's mutation epoch so
 * a deposed leader's in-flight mutation is rejected.
 */
export interface LeaseRecord {
    readonly name: string;
    readonly holder: string;
    readonly token: number;
    readonly expiresAtMs: number;
}
/** Atomic store port. `compareAndSet` succeeds only when the stored value equals `expected`. */
export interface LeaseStore {
    read(name: string): Promise<LeaseRecord | undefined> | LeaseRecord | undefined;
    compareAndSet(name: string, expected: LeaseRecord | undefined, next: LeaseRecord): Promise<boolean> | boolean;
}
export declare class InMemoryLeaseStore implements LeaseStore {
    private readonly leases;
    read(name: string): LeaseRecord | undefined;
    compareAndSet(name: string, expected: LeaseRecord | undefined, next: LeaseRecord): boolean;
}
export interface LeaseGrant {
    readonly granted: boolean;
    readonly lease?: LeaseRecord;
    readonly reason: 'acquired' | 'renewed' | 'held-by-other' | 'lost-race';
}
export declare class FencingError extends Error {
    readonly presented: number;
    readonly current: number | undefined;
    constructor(presented: number, current: number | undefined);
}
export declare class LeaseCoordinator {
    private readonly store;
    readonly ttlMs: number;
    constructor(store: LeaseStore, ttlMs?: number);
    /** Acquires or renews. A new holder only wins after expiry; every new holder gets token+1, a renewal keeps its token. */
    acquire(name: string, holder: string, nowMs: number): Promise<LeaseGrant>;
    release(name: string, holder: string, nowMs: number): Promise<boolean>;
    /** Rejects any operation whose fencing token is not the current, unexpired lease token. */
    assertFence(name: string, token: number, nowMs: number): Promise<void>;
    leader(name: string, nowMs: number): Promise<string | undefined>;
}
//# sourceMappingURL=coordination.d.ts.map