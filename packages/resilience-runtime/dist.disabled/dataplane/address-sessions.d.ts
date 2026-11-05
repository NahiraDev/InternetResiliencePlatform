/**
 * Phase 132 — Network Address / Session Management.
 *
 * CIDR-based address pools with expiring leases, reservations, renewals and
 * device bindings. Allocation is deterministic (lowest free address first),
 * exhaustion is reported rather than hidden, and pools may not overlap.
 */
import { AddressError } from './cidr.js';
export interface AddressLease {
    readonly address: string;
    readonly poolId: string;
    readonly holder: string;
    readonly sessionId: string;
    readonly grantedAtMs: number;
    readonly expiresAtMs: number;
    readonly reserved: boolean;
}
export declare class AddressPoolError extends Error {
    readonly code: 'pool-overlap' | 'unknown-pool' | 'exhausted' | 'not-in-pool' | 'already-leased' | 'not-holder' | 'unknown-lease' | 'invalid-ttl';
    constructor(code: 'pool-overlap' | 'unknown-pool' | 'exhausted' | 'not-in-pool' | 'already-leased' | 'not-holder' | 'unknown-lease' | 'invalid-ttl', message?: string);
}
export declare class AddressManager {
    private readonly pools;
    private readonly leases;
    private sequence;
    addPool(id: string, cidrText: string, options?: {
        readonly excluded?: readonly string[];
    }): void;
    private key;
    private live;
    allocate(poolId: string, holder: string, ttlMs: number, nowMs: number, options?: {
        readonly preferred?: string;
        readonly reserved?: boolean;
    }): AddressLease;
    renew(poolId: string, address: string, holder: string, ttlMs: number, nowMs: number): AddressLease;
    release(poolId: string, address: string, holder: string): boolean;
    /** Which holder currently owns an address in any pool; undefined when free or expired. */
    holderOf(address: string, nowMs: number): AddressLease | undefined;
    leasesFor(holder: string, nowMs: number): readonly AddressLease[];
    utilization(poolId: string, nowMs: number): {
        readonly total: bigint;
        readonly leased: number;
        readonly ratio: number;
    };
}
export { AddressError };
//# sourceMappingURL=address-sessions.d.ts.map