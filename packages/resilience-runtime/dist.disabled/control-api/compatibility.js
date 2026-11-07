/**
 * Phase 140 — API Compatibility, Migration & Deprecation Framework.
 *
 * Classifies schema changes as breaking or compatible, enforces deprecation
 * windows (announce → sunset with a minimum notice period), and applies
 * ordered payload migrations between versions with verifiable round-trips.
 */
import { compareSemVer, parseSemVer } from './semver.js';
export const diffSchemas = (before, after) => {
    const out = [];
    for (const [k, a] of Object.entries(before)) {
        const b = after[k];
        if (!b) {
            out.push({ field: k, kind: 'removed', breaking: true });
            continue;
        }
        if (a.type !== b.type) {
            out.push({ field: k, kind: 'type-changed', breaking: true });
            continue;
        }
        if (!a.required && b.required)
            out.push({ field: k, kind: 'tightened', breaking: true });
        if (a.required && !b.required)
            out.push({ field: k, kind: 'loosened', breaking: false });
        const maxTighter = (a.maxLength ?? Infinity) > (b.maxLength ?? Infinity) || (a.max ?? Infinity) > (b.max ?? Infinity);
        const minTighter = (b.min ?? -Infinity) > (a.min ?? -Infinity);
        if (maxTighter || minTighter)
            out.push({ field: k, kind: 'tightened', breaking: true });
        if (a.oneOf && b.oneOf) {
            if (a.oneOf.some((v) => !b.oneOf?.includes(v)))
                out.push({ field: k, kind: 'enum-narrowed', breaking: true });
            if (b.oneOf.some((v) => !a.oneOf?.includes(v)))
                out.push({ field: k, kind: 'enum-widened', breaking: false });
        }
        else if (!a.oneOf && b.oneOf)
            out.push({ field: k, kind: 'enum-narrowed', breaking: true });
    }
    for (const [k, b] of Object.entries(after))
        if (!before[k])
            out.push({ field: k, kind: b.required ? 'added-required' : 'added-optional', breaking: b.required === true });
    return Object.freeze(out.sort((x, y) => x.field.localeCompare(y.field) || x.kind.localeCompare(y.kind)));
};
/** The minimum version bump permitted for a set of changes. */
export const requiredBump = (changes) => changes.some((c) => c.breaking) ? 'major' : changes.length ? 'minor' : 'patch';
export const checkVersionBump = (from, to, changes) => {
    const a = parseSemVer(from);
    const b = parseSemVer(to);
    const required = requiredBump(changes);
    if (compareSemVer(b, a) <= 0)
        return { ok: false, required, reason: 'version-must-increase' };
    const actual = b.major > a.major ? 'major' : b.minor > a.minor ? 'minor' : 'patch';
    const rank = { patch: 0, minor: 1, major: 2 };
    return rank[actual] >= rank[required] ? { ok: true, required } : { ok: false, required, reason: `${required}-bump-required-for-${changes.filter((c) => c.breaking).length ? 'breaking' : 'additive'}-changes` };
};
export class DeprecationPolicy {
    minimumNoticeMs;
    items = new Map();
    constructor(minimumNoticeMs) {
        this.minimumNoticeMs = minimumNoticeMs;
        if (minimumNoticeMs < 0)
            throw new Error('minimumNoticeMs must be non-negative');
    }
    announce(d) {
        if (d.sunsetAtMs - d.announcedAtMs < this.minimumNoticeMs)
            throw new Error(`deprecation of ${d.target} gives less than the minimum notice period`);
        this.items.set(d.target, Object.freeze({ ...d }));
    }
    status(target, nowMs) { const d = this.items.get(target); return !d || nowMs < d.announcedAtMs ? 'active' : nowMs >= d.sunsetAtMs ? 'sunset' : 'deprecated'; }
    /** Headers advertising deprecation to clients (Deprecation / Sunset / Link style). */
    headers(target, nowMs) {
        const d = this.items.get(target);
        if (!d || this.status(target, nowMs) === 'active')
            return Object.freeze({});
        return Object.freeze({ deprecation: new Date(d.announcedAtMs).toUTCString(), sunset: new Date(d.sunsetAtMs).toUTCString(), ...(d.replacement ? { link: `<${d.replacement}>; rel="successor-version"` } : {}) });
    }
    upcoming(nowMs, withinMs) { return Object.freeze([...this.items.values()].filter((d) => d.sunsetAtMs > nowMs && d.sunsetAtMs - nowMs <= withinMs).sort((a, b) => a.sunsetAtMs - b.sunsetAtMs)); }
}
export class MigrationChain {
    steps = new Map();
    add(m) { if (this.steps.has(m.from))
        throw new Error(`migration from ${m.from} already registered`); this.steps.set(m.from, m); }
    /** Applies migrations from `from` until `to`; refuses missing steps and cycles. */
    migrate(payload, from, to) {
        let cur = from;
        let data = structuredClone(payload);
        const seen = new Set();
        while (cur !== to) {
            if (seen.has(cur))
                throw new Error(`migration cycle at ${cur}`);
            seen.add(cur);
            const step = this.steps.get(cur);
            if (!step)
                throw new Error(`no migration path from ${cur} to ${to}`);
            data = step.up(data);
            cur = step.to;
        }
        return data;
    }
    /** True when up then down reproduces the original for every sample, for each reversible step. */
    verifyRoundTrip(samples) {
        const failures = [];
        for (const m of this.steps.values()) {
            if (!m.down)
                continue;
            for (const s of samples)
                if (JSON.stringify(m.down(m.up(structuredClone(s)))) !== JSON.stringify(s)) {
                    failures.push(`${m.from}->${m.to}`);
                    break;
                }
        }
        return Object.freeze(failures.sort());
    }
}
//# sourceMappingURL=compatibility.js.map