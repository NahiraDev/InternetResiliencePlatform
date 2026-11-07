/**
 * Phase 137 — Plugin/Provider Lifecycle Governance.
 *
 * Manifest verification (HMAC-SHA256 over a canonical manifest, constant-time
 * compare), capability allow-listing and a strict lifecycle state machine
 * (registered → verified → active ⇄ suspended → retired). Plugins that fail
 * health repeatedly are quarantined automatically; a plugin can never be
 * granted a capability that was not in its signed manifest or not allowed.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { compareSemVer, parseSemVer, satisfies } from './semver.js';
export class PluginGovernanceError extends Error {
    code;
    constructor(code, message) {
        super(message ? `${code}: ${message}` : code);
        this.code = code;
        this.name = 'PluginGovernanceError';
    }
}
const canonicalManifest = (m) => JSON.stringify([m.id, m.version, m.publisher, [...m.capabilities].sort(), m.requiresRuntime]);
export const signManifest = (m, key) => createHmac('sha256', key).update(canonicalManifest(m)).digest('hex');
const TRANSITIONS = {
    registered: ['verified', 'retired'], verified: ['active', 'retired'], active: ['suspended', 'quarantined', 'retired'],
    suspended: ['active', 'retired'], quarantined: ['suspended', 'retired'], retired: [],
};
export class PluginGovernor {
    options;
    plugins = new Map();
    constructor(options) {
        this.options = options;
        parseSemVer(options.runtimeVersion);
    }
    register(manifest, nowMs) {
        const prev = this.plugins.get(manifest.id);
        if (prev && compareSemVer(parseSemVer(manifest.version), parseSemVer(prev.manifest.version)) < 0)
            throw new PluginGovernanceError('downgrade', `${manifest.id} ${manifest.version} is older than ${prev.manifest.version}`);
        const rec = Object.freeze({ manifest: Object.freeze({ ...manifest }), state: 'registered', consecutiveFailures: 0, history: Object.freeze([{ state: 'registered', atMs: nowMs, reason: 'registered' }]) });
        this.plugins.set(manifest.id, rec);
        return rec;
    }
    verify(id, nowMs) {
        const rec = this.require(id);
        const m = rec.manifest;
        const key = this.options.publisherKeys[m.publisher];
        if (key === undefined)
            throw new PluginGovernanceError('untrusted-publisher', m.publisher);
        const expected = Buffer.from(signManifest(m, key), 'hex');
        const given = Buffer.from(m.signature, 'hex');
        if (expected.length !== given.length || !timingSafeEqual(expected, given))
            throw new PluginGovernanceError('bad-signature');
        const denied = m.capabilities.filter((c) => !this.options.allowedCapabilities.includes(c));
        if (denied.length)
            throw new PluginGovernanceError('capability-not-allowed', denied.join(','));
        if (!satisfies(this.options.runtimeVersion, m.requiresRuntime))
            throw new PluginGovernanceError('runtime-incompatible', `${m.requiresRuntime} vs ${this.options.runtimeVersion}`);
        return this.move(rec, 'verified', nowMs, 'signature-and-capabilities-verified');
    }
    activate(id, nowMs) { return this.move(this.require(id), 'active', nowMs, 'activated'); }
    suspend(id, nowMs, reason) { return this.move(this.require(id), 'suspended', nowMs, reason); }
    retire(id, nowMs, reason) { return this.move(this.require(id), 'retired', nowMs, reason); }
    /** Records a health probe result; repeated failures quarantine an active plugin. */
    reportHealth(id, healthy, nowMs) {
        const rec = this.require(id);
        if (healthy) {
            const r = Object.freeze({ ...rec, consecutiveFailures: 0 });
            this.plugins.set(id, r);
            return r;
        }
        const failures = rec.consecutiveFailures + 1;
        const updated = Object.freeze({ ...rec, consecutiveFailures: failures });
        this.plugins.set(id, updated);
        if (rec.state === 'active' && failures >= (this.options.failureThreshold ?? 3))
            return this.move(updated, 'quarantined', nowMs, `health-failures:${failures}`);
        return updated;
    }
    /** The capabilities a plugin may currently exercise: only while active, and only those in its verified manifest. */
    effectiveCapabilities(id) {
        const rec = this.plugins.get(id);
        return rec?.state === 'active' ? Object.freeze([...rec.manifest.capabilities].sort()) : Object.freeze([]);
    }
    get(id) { return this.plugins.get(id); }
    list() { return Object.freeze([...this.plugins.values()].sort((a, b) => a.manifest.id.localeCompare(b.manifest.id))); }
    require(id) { const r = this.plugins.get(id); if (!r)
        throw new PluginGovernanceError('unknown-plugin', id); return r; }
    move(rec, to, nowMs, reason) {
        if (!TRANSITIONS[rec.state].includes(to))
            throw new PluginGovernanceError('invalid-transition', `${rec.state} -> ${to}`);
        const next = Object.freeze({ ...rec, state: to, history: Object.freeze([...rec.history, { state: to, atMs: nowMs, reason }]) });
        this.plugins.set(rec.manifest.id, next);
        return next;
    }
}
//# sourceMappingURL=plugin-lifecycle.js.map