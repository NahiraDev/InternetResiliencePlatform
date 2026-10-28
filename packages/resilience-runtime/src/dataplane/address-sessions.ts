/**
 * Phase 132 — Network Address / Session Management.
 *
 * CIDR-based address pools with expiring leases, reservations, renewals and
 * device bindings. Allocation is deterministic (lowest free address first),
 * exhaustion is reported rather than hidden, and pools may not overlap.
 */

import { AddressError, cidrContains, cidrOverlaps, cidrSize, formatAddress, parseAddress, parseCidr, type ParsedCidr } from './cidr.js';

export interface AddressLease {
  readonly address: string;
  readonly poolId: string;
  readonly holder: string;
  readonly sessionId: string;
  readonly grantedAtMs: number;
  readonly expiresAtMs: number;
  readonly reserved: boolean;
}

export class AddressPoolError extends Error {
  constructor(readonly code: 'pool-overlap' | 'unknown-pool' | 'exhausted' | 'not-in-pool' | 'already-leased' | 'not-holder' | 'unknown-lease' | 'invalid-ttl', message?: string) {
    super(message ?? code); this.name = 'AddressPoolError';
  }
}

interface Pool { readonly id: string; readonly cidr: ParsedCidr; readonly excluded: ReadonlySet<bigint> }

export class AddressManager {
  private readonly pools = new Map<string, Pool>();
  private readonly leases = new Map<string, AddressLease>(); // key: poolId|address
  private sequence = 0;

  addPool(id: string, cidrText: string, options: { readonly excluded?: readonly string[] } = {}): void {
    const cidr = parseCidr(cidrText);
    for (const p of this.pools.values()) if (cidrOverlaps(p.cidr, cidr)) throw new AddressPoolError('pool-overlap', `pool ${id} overlaps ${p.id}`);
    // IPv4 network and broadcast addresses are never allocatable (except /31 and /32).
    const reserved = new Set<bigint>((options.excluded ?? []).map((a) => parseAddress(a).value));
    if (cidr.family === 4 && cidr.prefix < 31) { reserved.add(cidr.network); reserved.add(cidr.network + cidrSize(cidr) - 1n); }
    this.pools.set(id, { id, cidr, excluded: reserved });
  }

  private key(poolId: string, value: bigint, family: 4 | 6) { return `${poolId}|${formatAddress(family, value)}`; }

  private live(nowMs: number): void { for (const [k, l] of this.leases) if (!l.reserved && l.expiresAtMs <= nowMs) this.leases.delete(k); }

  allocate(poolId: string, holder: string, ttlMs: number, nowMs: number, options: { readonly preferred?: string; readonly reserved?: boolean } = {}): AddressLease {
    if (!(ttlMs > 0)) throw new AddressPoolError('invalid-ttl');
    const pool = this.pools.get(poolId);
    if (!pool) throw new AddressPoolError('unknown-pool');
    this.live(nowMs);
    const make = (value: bigint): AddressLease => {
      const lease: AddressLease = Object.freeze({
        address: formatAddress(pool.cidr.family, value), poolId, holder, sessionId: `sess-${(++this.sequence).toString().padStart(6, '0')}`,
        grantedAtMs: nowMs, expiresAtMs: options.reserved ? Number.MAX_SAFE_INTEGER : nowMs + ttlMs, reserved: options.reserved === true,
      });
      this.leases.set(this.key(poolId, value, pool.cidr.family), lease);
      return lease;
    };
    if (options.preferred) {
      const a = parseAddress(options.preferred);
      if (!cidrContains(pool.cidr, a) || pool.excluded.has(a.value)) throw new AddressPoolError('not-in-pool');
      if (this.leases.has(this.key(poolId, a.value, a.family))) throw new AddressPoolError('already-leased');
      return make(a.value);
    }
    const last = pool.cidr.network + cidrSize(pool.cidr);
    // Linear scan is bounded by the number of live leases plus exclusions, not pool size, for any realistic pool.
    for (let v = pool.cidr.network; v < last; v += 1n) {
      if (pool.excluded.has(v) || this.leases.has(this.key(poolId, v, pool.cidr.family))) continue;
      return make(v);
    }
    throw new AddressPoolError('exhausted', `pool ${poolId} is exhausted`);
  }

  renew(poolId: string, address: string, holder: string, ttlMs: number, nowMs: number): AddressLease {
    this.live(nowMs);
    const a = parseAddress(address);
    const k = this.key(poolId, a.value, a.family);
    const cur = this.leases.get(k);
    if (!cur) throw new AddressPoolError('unknown-lease');
    if (cur.holder !== holder) throw new AddressPoolError('not-holder');
    const next: AddressLease = Object.freeze({ ...cur, expiresAtMs: cur.reserved ? cur.expiresAtMs : nowMs + ttlMs });
    this.leases.set(k, next);
    return next;
  }

  release(poolId: string, address: string, holder: string): boolean {
    const a = parseAddress(address);
    const k = this.key(poolId, a.value, a.family);
    const cur = this.leases.get(k);
    if (!cur) return false;
    if (cur.holder !== holder) throw new AddressPoolError('not-holder');
    return this.leases.delete(k);
  }

  /** Which holder currently owns an address in any pool; undefined when free or expired. */
  holderOf(address: string, nowMs: number): AddressLease | undefined {
    this.live(nowMs);
    const a = parseAddress(address);
    for (const p of this.pools.values()) if (cidrContains(p.cidr, a)) return this.leases.get(this.key(p.id, a.value, a.family));
    return undefined;
  }

  leasesFor(holder: string, nowMs: number): readonly AddressLease[] {
    this.live(nowMs);
    return Object.freeze([...this.leases.values()].filter((l) => l.holder === holder).sort((a, b) => a.address.localeCompare(b.address)));
  }

  utilization(poolId: string, nowMs: number): { readonly total: bigint; readonly leased: number; readonly ratio: number } {
    const pool = this.pools.get(poolId);
    if (!pool) throw new AddressPoolError('unknown-pool');
    this.live(nowMs);
    const total = cidrSize(pool.cidr) - BigInt(pool.excluded.size);
    const leased = [...this.leases.values()].filter((l) => l.poolId === poolId).length;
    return Object.freeze({ total, leased, ratio: total <= 0n ? 1 : leased / Number(total) });
  }
}

export { AddressError };
