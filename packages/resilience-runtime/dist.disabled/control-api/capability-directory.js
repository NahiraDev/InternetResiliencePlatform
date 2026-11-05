/**
 * Phase 138 — Capability Discovery & Provider Directory.
 *
 * A directory of providers keyed by the capabilities they offer, with semantic
 * version ranges, heartbeat-based liveness and deterministic resolution.
 * Discovery is read-only metadata: selecting a provider here grants no
 * authority; resources are still admitted through the fabric.
 */
import { compareSemVer, parseSemVer, satisfies } from './semver.js';
export class CapabilityDirectory {
    listings = new Map();
    announce(listing, nowMs) {
        if (listing.heartbeatTtlMs <= 0)
            throw new Error('heartbeatTtlMs must be positive');
        for (const c of listing.capabilities)
            parseSemVer(c.version);
        this.listings.set(listing.id, Object.freeze({ ...listing, lastHeartbeatMs: nowMs }));
    }
    heartbeat(id, nowMs) {
        const l = this.listings.get(id);
        if (!l)
            return false;
        this.listings.set(id, Object.freeze({ ...l, lastHeartbeatMs: nowMs }));
        return true;
    }
    withdraw(id) { return this.listings.delete(id); }
    isAlive(id, nowMs) { const l = this.listings.get(id); return l !== undefined && nowMs - l.lastHeartbeatMs <= l.heartbeatTtlMs; }
    /** All matching live providers, best first: region match, higher version, higher priority, then id. */
    discover(query, nowMs) {
        const out = [];
        for (const l of this.listings.values()) {
            if (!this.isAlive(l.id, nowMs) || query.excludeProviders?.includes(l.id))
                continue;
            const matches = l.capabilities.filter((c) => c.name === query.capability && (!query.range || satisfies(c.version, query.range)));
            const best = matches.sort((a, b) => compareSemVer(parseSemVer(b.version), parseSemVer(a.version)))[0];
            if (best)
                out.push({ r: Object.freeze({ providerId: l.id, capability: best, alive: true }), l });
        }
        return Object.freeze(out.sort((a, b) => (query.region ? Number(b.l.region === query.region) - Number(a.l.region === query.region) : 0)
            || compareSemVer(parseSemVer(b.r.capability.version), parseSemVer(a.r.capability.version))
            || b.l.priority - a.l.priority || a.l.id.localeCompare(b.l.id)).map((x) => x.r));
    }
    resolve(query, nowMs) { return this.discover(query, nowMs)[0]; }
    /** Capabilities currently offered by no live provider but required: the gaps. */
    gaps(required, nowMs) {
        return Object.freeze(required.filter((c) => this.discover({ capability: c }, nowMs).length === 0).sort());
    }
    /** Removes listings dead for longer than `graceMs` past their TTL. */
    sweep(nowMs, graceMs = 0) {
        const gone = [];
        for (const l of [...this.listings.values()])
            if (nowMs - l.lastHeartbeatMs > l.heartbeatTtlMs + graceMs) {
                this.listings.delete(l.id);
                gone.push(l.id);
            }
        return Object.freeze(gone.sort());
    }
}
//# sourceMappingURL=capability-directory.js.map