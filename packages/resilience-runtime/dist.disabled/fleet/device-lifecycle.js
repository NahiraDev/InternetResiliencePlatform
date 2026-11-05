/**
 * Phase 115 — Device Enrollment & Lifecycle.
 *
 * Operational lifecycle for managed devices layered on top of the identity
 * ledger: provisioning → active ⇄ maintenance → decommissioning → decommissioned,
 * plus derived presence (online / stale / lost) from heartbeats. Decommissioning
 * requires the device identity to have been revoked first, so a retired device
 * can never keep control-plane trust.
 */
const NEXT = Object.freeze({
    provisioning: ['active', 'decommissioning'],
    active: ['maintenance', 'decommissioning'],
    maintenance: ['active', 'decommissioning'],
    decommissioning: ['decommissioned'],
    decommissioned: [],
});
export const DEFAULT_PRESENCE_POLICY = Object.freeze({ staleAfterMs: 3 * 60_000, lostAfterMs: 15 * 60_000 });
export class LifecycleError extends Error {
    code;
    constructor(code, detail) {
        super(detail ? `${code}: ${detail}` : code);
        this.code = code;
        this.name = 'LifecycleError';
    }
}
export const derivePresence = (lastSeenAtMs, nowMs, policy = DEFAULT_PRESENCE_POLICY) => {
    if (lastSeenAtMs === undefined)
        return 'never-seen';
    const age = nowMs - lastSeenAtMs;
    return age >= policy.lostAfterMs ? 'lost' : age >= policy.staleAfterMs ? 'stale' : 'online';
};
export class DeviceLifecycleManager {
    deps;
    records = new Map();
    constructor(deps) {
        this.deps = deps;
    }
    begin(deviceId, nowMs) {
        if (this.records.has(deviceId))
            throw new LifecycleError('already-managed');
        const rec = Object.freeze({ deviceId, state: 'provisioning', changedAtMs: nowMs, history: Object.freeze([{ from: 'none', to: 'provisioning', atMs: nowMs, reason: 'begin' }]) });
        this.records.set(deviceId, rec);
        return rec;
    }
    transition(deviceId, to, reason, nowMs) {
        const cur = this.records.get(deviceId);
        if (!cur)
            throw new LifecycleError('unknown-device');
        if (!NEXT[cur.state].includes(to))
            throw new LifecycleError('illegal-transition', `${cur.state} -> ${to}`);
        if ((to === 'active') && !this.deps.isIdentityTrusted(deviceId))
            throw new LifecycleError('identity-not-trusted');
        if (to === 'decommissioned' && this.deps.isIdentityTrusted(deviceId))
            throw new LifecycleError('identity-still-trusted', 'revoke the device identity before decommissioning');
        const next = Object.freeze({ ...cur, state: to, changedAtMs: nowMs, history: Object.freeze([...cur.history, { from: cur.state, to, atMs: nowMs, reason }]) });
        this.records.set(deviceId, next);
        return next;
    }
    get(deviceId) { return this.records.get(deviceId); }
    inState(state) { return Object.freeze([...this.records.values()].filter((r) => r.state === state).map((r) => r.deviceId).sort()); }
    /** Only active, trusted devices may receive orchestrated work. */
    isOperational(deviceId) { return this.records.get(deviceId)?.state === 'active' && this.deps.isIdentityTrusted(deviceId); }
}
//# sourceMappingURL=device-lifecycle.js.map