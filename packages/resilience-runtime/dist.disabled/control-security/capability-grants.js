/**
 * Phase 109 — Authorization / Capability Model.
 *
 * Scoped, expiring capability grants with deny-wins evaluation and attenuating
 * delegation (a delegated grant can never exceed its parent in capability,
 * scope or lifetime). `actorFromGrants` projects the effective grants onto the
 * existing `ActorIdentity`, so the one `TrustBoundaryAuthorizer` remains the
 * authority for privileged-capability ceilings.
 */
export class GrantError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'GrantError';
    }
}
/** A grant scope covers a query when every constrained dimension matches; unset dimensions are wildcards. */
export const scopeCovers = (grant, query) => ['tenantId', 'deviceId', 'resourceId'].every((k) => grant[k] === undefined || grant[k] === query[k]);
const scopeWithin = (child, parent) => ['tenantId', 'deviceId', 'resourceId'].every((k) => parent[k] === undefined || child[k] === parent[k]);
const capabilityCovers = (granted, requested) => granted === requested || (granted.endsWith('.*') && requested.startsWith(granted.slice(0, -1)));
export class CapabilityGrantStore {
    grants = new Map();
    revoked = new Set();
    add(grant) {
        if (this.grants.has(grant.grantId))
            throw new GrantError('duplicate-grant-id');
        if (!(grant.expiresAtMs > (grant.notBeforeMs ?? 0)))
            throw new GrantError('invalid-grant-lifetime');
        if (grant.parentGrantId) {
            const parent = this.grants.get(grant.parentGrantId);
            if (!parent || this.isRevoked(parent.grantId))
                throw new GrantError('unknown-or-revoked-parent');
            if (!parent.delegable)
                throw new GrantError('parent-not-delegable');
            if (parent.effect !== 'allow' || grant.effect !== 'allow')
                throw new GrantError('only-allow-grants-delegate');
            if (!capabilityCovers(parent.capability, grant.capability))
                throw new GrantError('delegation-exceeds-capability');
            if (!scopeWithin(grant.scope, parent.scope))
                throw new GrantError('delegation-exceeds-scope');
            if (grant.expiresAtMs > parent.expiresAtMs)
                throw new GrantError('delegation-exceeds-lifetime');
            if (grant.delegable && !parent.delegable)
                throw new GrantError('delegation-escalates-delegability');
        }
        const frozen = Object.freeze({ ...grant, scope: Object.freeze({ ...grant.scope }) });
        this.grants.set(grant.grantId, frozen);
        return frozen;
    }
    /** Revoking a grant revokes everything delegated from it. */
    revoke(grantId) {
        if (!this.grants.has(grantId))
            throw new GrantError('unknown-grant');
        const out = [];
        const walk = (id) => { if (this.revoked.has(id))
            return; this.revoked.add(id); out.push(id); for (const g of this.grants.values())
            if (g.parentGrantId === id)
                walk(g.grantId); };
        walk(grantId);
        return Object.freeze(out.sort());
    }
    isRevoked(id) {
        let cur = this.grants.get(id);
        while (cur) {
            if (this.revoked.has(cur.grantId))
                return true;
            cur = cur.parentGrantId ? this.grants.get(cur.parentGrantId) : undefined;
        }
        return false;
    }
    effectiveGrants(subject, nowMs) {
        return Object.freeze([...this.grants.values()].filter((g) => g.subject === subject && !this.isRevoked(g.grantId) && nowMs < g.expiresAtMs && nowMs >= (g.notBeforeMs ?? 0)).sort((a, b) => a.grantId.localeCompare(b.grantId)));
    }
    authorize(q) {
        const matching = this.effectiveGrants(q.subject, q.nowMs).filter((g) => capabilityCovers(g.capability, q.capability) && scopeCovers(g.scope, q.scope));
        const deny = matching.find((g) => g.effect === 'deny');
        if (deny)
            return Object.freeze({ allowed: false, reason: 'explicit-deny', grantId: deny.grantId });
        const allow = matching.find((g) => g.effect === 'allow');
        return allow ? Object.freeze({ allowed: true, reason: 'allowed', grantId: allow.grantId }) : Object.freeze({ allowed: false, reason: 'no-matching-grant' });
    }
}
/** Projects effective grants onto the existing actor model; the trust-boundary authorizer still has the final say. */
export const actorFromGrants = (store, input) => {
    const grants = store.effectiveGrants(input.actorId, input.nowMs).filter((g) => scopeCovers(g.scope, input.scope));
    return Object.freeze({
        actorId: input.actorId, boundary: input.boundary, verified: input.verified,
        grantedCapabilities: Object.freeze([...new Set(grants.filter((g) => g.effect === 'allow' && !g.capability.endsWith('.*')).map((g) => g.capability))].sort()),
        deniedCapabilities: Object.freeze([...new Set(grants.filter((g) => g.effect === 'deny').map((g) => g.capability))].sort()),
    });
};
//# sourceMappingURL=capability-grants.js.map