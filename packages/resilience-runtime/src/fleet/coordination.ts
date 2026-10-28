/**
 * Phase 117 — Distributed Control & Coordination.
 *
 * Lease-based leadership with fencing tokens over an injected compare-and-set
 * store. Every granted lease carries a strictly increasing fencing token; a
 * holder presents it with each privileged operation and `assertFence` rejects
 * stale tokens. The token maps onto the privileged boundary's mutation epoch so
 * a deposed leader's in-flight mutation is rejected.
 */

export interface LeaseRecord { readonly name: string; readonly holder: string; readonly token: number; readonly expiresAtMs: number }

/** Atomic store port. `compareAndSet` succeeds only when the stored value equals `expected`. */
export interface LeaseStore {
  read(name: string): Promise<LeaseRecord | undefined> | LeaseRecord | undefined;
  compareAndSet(name: string, expected: LeaseRecord | undefined, next: LeaseRecord): Promise<boolean> | boolean;
}

export class InMemoryLeaseStore implements LeaseStore {
  private readonly leases = new Map<string, LeaseRecord>();
  read(name: string) { return this.leases.get(name); }
  compareAndSet(name: string, expected: LeaseRecord | undefined, next: LeaseRecord): boolean {
    const cur = this.leases.get(name);
    const same = (cur === undefined && expected === undefined) || (cur !== undefined && expected !== undefined && cur.holder === expected.holder && cur.token === expected.token && cur.expiresAtMs === expected.expiresAtMs);
    if (!same) return false;
    this.leases.set(name, Object.freeze({ ...next }));
    return true;
  }
}

export interface LeaseGrant { readonly granted: boolean; readonly lease?: LeaseRecord; readonly reason: 'acquired' | 'renewed' | 'held-by-other' | 'lost-race' }

export class FencingError extends Error {
  constructor(readonly presented: number, readonly current: number | undefined) {
    super(`stale fencing token ${presented}; current is ${current ?? 'none'}`);
    this.name = 'FencingError';
  }
}

export class LeaseCoordinator {
  constructor(private readonly store: LeaseStore, readonly ttlMs: number = 15_000) {
    if (ttlMs <= 0) throw new Error('lease ttl must be positive');
  }

  /** Acquires or renews. A new holder only wins after expiry; every new holder gets token+1, a renewal keeps its token. */
  async acquire(name: string, holder: string, nowMs: number): Promise<LeaseGrant> {
    const cur = await this.store.read(name);
    if (cur && cur.holder === holder && cur.expiresAtMs > nowMs) {
      const next = { ...cur, expiresAtMs: nowMs + this.ttlMs };
      return (await this.store.compareAndSet(name, cur, next)) ? Object.freeze({ granted: true, lease: Object.freeze(next), reason: 'renewed' as const }) : Object.freeze({ granted: false, reason: 'lost-race' as const });
    }
    if (cur && cur.expiresAtMs > nowMs) return Object.freeze({ granted: false, reason: 'held-by-other' as const });
    const next: LeaseRecord = { name, holder, token: (cur?.token ?? 0) + 1, expiresAtMs: nowMs + this.ttlMs };
    return (await this.store.compareAndSet(name, cur, next)) ? Object.freeze({ granted: true, lease: Object.freeze(next), reason: 'acquired' as const }) : Object.freeze({ granted: false, reason: 'lost-race' as const });
  }

  async release(name: string, holder: string, nowMs: number): Promise<boolean> {
    const cur = await this.store.read(name);
    if (!cur || cur.holder !== holder) return false;
    return this.store.compareAndSet(name, cur, { ...cur, expiresAtMs: nowMs });
  }

  /** Rejects any operation whose fencing token is not the current, unexpired lease token. */
  async assertFence(name: string, token: number, nowMs: number): Promise<void> {
    const cur = await this.store.read(name);
    if (!cur || cur.token !== token || cur.expiresAtMs <= nowMs) throw new FencingError(token, cur?.token);
  }

  async leader(name: string, nowMs: number): Promise<string | undefined> {
    const cur = await this.store.read(name);
    return cur && cur.expiresAtMs > nowMs ? cur.holder : undefined;
  }
}
