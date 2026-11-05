/**
 * Phase 109 — Authorization / Capability Model.
 *
 * Scoped, expiring capability grants with deny-wins evaluation and attenuating
 * delegation (a delegated grant can never exceed its parent in capability,
 * scope or lifetime). `actorFromGrants` projects the effective grants onto the
 * existing `ActorIdentity`, so the one `TrustBoundaryAuthorizer` remains the
 * authority for privileged-capability ceilings.
 */
import type { ActorIdentity, TrustBoundary } from '../security/trust-boundaries.js';
export interface GrantScope {
    readonly tenantId?: string;
    readonly deviceId?: string;
    readonly resourceId?: string;
}
export interface CapabilityGrant {
    readonly grantId: string;
    readonly subject: string;
    readonly capability: string;
    readonly effect: 'allow' | 'deny';
    readonly scope: GrantScope;
    readonly notBeforeMs?: number;
    readonly expiresAtMs: number;
    readonly parentGrantId?: string;
    readonly delegable: boolean;
}
export interface AuthorizationQuery {
    readonly subject: string;
    readonly capability: string;
    readonly scope: GrantScope;
    readonly nowMs: number;
}
export interface GrantDecision {
    readonly allowed: boolean;
    readonly reason: 'allowed' | 'explicit-deny' | 'no-matching-grant';
    readonly grantId?: string;
}
export declare class GrantError extends Error {
    readonly code: string;
    constructor(code: string);
}
/** A grant scope covers a query when every constrained dimension matches; unset dimensions are wildcards. */
export declare const scopeCovers: (grant: GrantScope, query: GrantScope) => boolean;
export declare class CapabilityGrantStore {
    private readonly grants;
    private readonly revoked;
    add(grant: CapabilityGrant): CapabilityGrant;
    /** Revoking a grant revokes everything delegated from it. */
    revoke(grantId: string): readonly string[];
    private isRevoked;
    effectiveGrants(subject: string, nowMs: number): readonly CapabilityGrant[];
    authorize(q: AuthorizationQuery): GrantDecision;
}
/** Projects effective grants onto the existing actor model; the trust-boundary authorizer still has the final say. */
export declare const actorFromGrants: (store: CapabilityGrantStore, input: {
    actorId: string;
    boundary: TrustBoundary;
    verified: boolean;
    nowMs: number;
    scope: GrantScope;
}) => ActorIdentity;
//# sourceMappingURL=capability-grants.d.ts.map