/**
 * Phase 117 — Distributed Control & Coordination.
 *
 * Lease-based leadership with fencing tokens over an injected compare-and-set
 * store. Every granted lease carries a strictly increasing fencing token; a
 * holder presents it with each privileged operation and `assertFence` rejects
 * stale tokens. The token maps onto the privileged boundary's mutation epoch so
 * a deposed leader's in-flight mutation is rejected.
 */
export class InMemoryLeaseStore {
    leases = new Map();
    read(name) { return this.leases.get(name); }
    compareAndSet(name, expected, next) {
        const cur = this.leases.get(name);
        const same = (cur === undefined && expected === undefined) || (cur !== undefined && expected !== undefined && cur.holder === expected.holder && cur.token === expected.token && cur.expiresAtMs === expected.expiresAtMs);
        if (!same)
            return false;
        this.leases.set(name, Object.freeze({ ...next }));
        return true;
    }
}
export class FencingError extends Error {
    presented;
    current;
    constructor(presented, current) {
        super(`stale fencing token ${presented}; current is ${current ?? 'none'}`);
        this.presented = presented;
        this.current = current;
        this.name = 'FencingError';
    }
}
export class LeaseCoordinator {
    store;
    ttlMs;
    constructor(store, ttlMs = 15_000) {
        this.store = store;
        this.ttlMs = ttlMs;
        if (ttlMs <= 0)
            throw new Error('lease ttl must be positive');
    }
    /** Acquires or renews. A new holder only wins after expiry; every new holder gets token+1, a renewal keeps its token. */
    async acquire(name, holder, nowMs) {
        const cur = await this.store.read(name);
        if (cur && cur.holder === holder && cur.expiresAtMs > nowMs) {
            const next = { ...cur, expiresAtMs: nowMs + this.ttlMs };
            return (await this.store.compareAndSet(name, cur, next)) ? Object.freeze({ granted: true, lease: Object.freeze(next), reason: 'renewed' }) : Object.freeze({ granted: false, reason: 'lost-race' });
        }
        if (cur && cur.expiresAtMs > nowMs)
            return Object.freeze({ granted: false, reason: 'held-by-other' });
        const next = { name, holder, token: (cur?.token ?? 0) + 1, expiresAtMs: nowMs + this.ttlMs };
        return (await this.store.compareAndSet(name, cur, next)) ? Object.freeze({ granted: true, lease: Object.freeze(next), reason: 'acquired' }) : Object.freeze({ granted: false, reason: 'lost-race' });
    }
    async release(name, holder, nowMs) {
        const cur = await this.store.read(name);
        if (!cur || cur.holder !== holder)
            return false;
        return this.store.compareAndSet(name, cur, { ...cur, expiresAtMs: nowMs });
    }
    /** Rejects any operation whose fencing token is not the current, unexpired lease token. */
    async assertFence(name, token, nowMs) {
        const cur = await this.store.read(name);
        if (!cur || cur.token !== token || cur.expiresAtMs <= nowMs)
            throw new FencingError(token, cur?.token);
    }
    async leader(name, nowMs) {
        const cur = await this.store.read(name);
        return cur && cur.expiresAtMs > nowMs ? cur.holder : undefined;
    }
}
//# sourceMappingURL=coordination.js.map