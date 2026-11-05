/**
 * Phase 142 — Data Classification, Retention & Deletion.
 *
 * Classification levels with per-class retention, legal holds, a deletion
 * planner that never deletes held or still-retained records, and tamper-evident
 * deletion receipts. The planner is pure; executing a plan is the store's job.
 */
import { createHash } from 'node:crypto';
const RANK = { public: 0, internal: 1, confidential: 2, restricted: 3 };
export const DEFAULT_RETENTION = Object.freeze([
    { dataClass: 'public', retainMs: 365 * 86_400_000, maxRetainMs: 5 * 365 * 86_400_000 },
    { dataClass: 'internal', retainMs: 180 * 86_400_000, maxRetainMs: 2 * 365 * 86_400_000 },
    { dataClass: 'confidential', retainMs: 90 * 86_400_000, maxRetainMs: 365 * 86_400_000 },
    { dataClass: 'restricted', retainMs: 30 * 86_400_000, maxRetainMs: 90 * 86_400_000 },
]);
export const validateRetention = (rules) => {
    const v = [];
    for (const r of rules)
        if (!(r.retainMs > 0) || r.maxRetainMs < r.retainMs)
            v.push(`${r.dataClass}: invalid retention window`);
    const sorted = [...rules].sort((a, b) => RANK[a.dataClass] - RANK[b.dataClass]);
    for (let i = 1; i < sorted.length; i += 1)
        if (sorted[i].maxRetainMs > sorted[i - 1].maxRetainMs)
            v.push(`${sorted[i].dataClass}: more sensitive data may not be kept longer than less sensitive data`);
    for (const c of Object.keys(RANK))
        if (!rules.some((r) => r.dataClass === c))
            v.push(`${c}: no retention rule`);
    return Object.freeze(v);
};
const holdApplies = (h, r, nowMs) => (h.releasedAtMs === undefined || h.releasedAtMs > nowMs) && (h.tenant === undefined || h.tenant === r.tenant) && (h.subject === undefined || h.subject === r.subject);
export const planDeletion = (records, rules, holds, nowMs, erasureSubjects = []) => {
    const bad = validateRetention(rules);
    if (bad.length)
        throw new Error(`invalid retention rules: ${bad.join('; ')}`);
    const rule = new Map(rules.map((r) => [r.dataClass, r]));
    const del = [];
    const retained = [];
    const held = [];
    const overdue = [];
    for (const r of [...records].sort((a, b) => a.id.localeCompare(b.id))) {
        const hold = holds.find((h) => holdApplies(h, r, nowMs));
        if (hold) {
            held.push({ id: r.id, holdId: hold.id });
            if (nowMs - r.createdAtMs > rule.get(r.dataClass).maxRetainMs)
                overdue.push(r.id);
            continue;
        }
        const age = nowMs - r.createdAtMs;
        const erased = r.subject !== undefined && erasureSubjects.includes(r.subject);
        if (erased || age >= rule.get(r.dataClass).retainMs)
            del.push(r.id);
        else
            retained.push(r.id);
    }
    return Object.freeze({ delete: Object.freeze(del), retained: Object.freeze(retained), held: Object.freeze(held), overdue: Object.freeze(overdue) });
};
/** A receipt proves a record was deleted without retaining its content: only a digest of its metadata. */
export const deletionReceipt = (r, deletedAtMs, basis) => Object.freeze({ recordId: r.id, dataClass: r.dataClass, deletedAtMs, basis, digest: createHash('sha256').update(JSON.stringify([r.id, r.dataClass, r.createdAtMs, deletedAtMs, basis])).digest('hex') });
/** The strictest class wins when data of several classes is combined. */
export const combineClasses = (classes) => classes.reduce((m, c) => RANK[c] > RANK[m] ? c : m, 'public');
export const canFlow = (from, to) => RANK[to] >= RANK[from];
//# sourceMappingURL=data-lifecycle.js.map