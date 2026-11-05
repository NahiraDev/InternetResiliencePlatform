/**
 * Phase 147 — Distributed State Consistency & Conflict Recovery.
 *
 * Version vectors detect concurrent writes precisely; non-concurrent updates
 * resolve by causality, concurrent ones by an explicit, deterministic policy
 * (never silently by wall clock alone) and are always reported as conflicts.
 * Also provides a grow/shrink-safe observed-remove set for replicated membership.
 */
export const compareVectors = (a, b) => {
    let aAhead = false;
    let bAhead = false;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const x = a[k] ?? 0;
        const y = b[k] ?? 0;
        if (x > y)
            aAhead = true;
        else if (y > x)
            bAhead = true;
    }
    return aAhead && bAhead ? 'concurrent' : aAhead ? 'after' : bAhead ? 'before' : 'equal';
};
export const mergeVectors = (a, b) => {
    const out = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
        out[k] = Math.max(a[k] ?? 0, b[k] ?? 0);
    return Object.freeze(out);
};
export const bump = (v, replica) => Object.freeze({ ...v, [replica]: (v[replica] ?? 0) + 1 });
/** Deterministic default: later timestamp wins, ties broken by writer id; the loss is reported, never silent. */
export const lastWriterWins = (a, b) => a.atMs !== b.atMs ? (a.atMs > b.atMs ? 'a' : 'b') : a.writer >= b.writer ? 'a' : 'b';
export class ReplicatedMap {
    replicaId;
    policy;
    policyName;
    conflictCapacity;
    data = new Map();
    conflicts = [];
    constructor(replicaId, policy = lastWriterWins, policyName = 'last-writer-wins', conflictCapacity = 1_000) {
        this.replicaId = replicaId;
        this.policy = policy;
        this.policyName = policyName;
        this.conflictCapacity = conflictCapacity;
    }
    set(key, value, nowMs) {
        const prev = this.data.get(key);
        const next = Object.freeze({ value, vector: bump(prev?.vector ?? {}, this.replicaId), writer: this.replicaId, atMs: nowMs });
        this.data.set(key, next);
        return next;
    }
    get(key) { return this.data.get(key)?.value; }
    entry(key) { return this.data.get(key); }
    snapshot() { return Object.freeze(Object.fromEntries([...this.data].sort(([x], [y]) => x.localeCompare(y)))); }
    /** Merges a remote snapshot; returns the keys whose local value changed. Idempotent, commutative and associative. */
    merge(remote) {
        const changed = [];
        for (const [key, theirs] of Object.entries(remote)) {
            const mine = this.data.get(key);
            if (!mine) {
                this.data.set(key, theirs);
                changed.push(key);
                continue;
            }
            const order = compareVectors(mine.vector, theirs.vector);
            if (order === 'equal' || order === 'after')
                continue;
            if (order === 'before') {
                this.data.set(key, theirs);
                changed.push(key);
                continue;
            }
            const pick = this.policy(mine, theirs);
            const winner = pick === 'a' ? mine : theirs;
            this.data.set(key, Object.freeze({ ...winner, vector: mergeVectors(mine.vector, theirs.vector) }));
            this.conflicts.push(Object.freeze({ key, a: mine, b: theirs, resolvedTo: pick, policy: this.policyName }));
            while (this.conflicts.length > this.conflictCapacity)
                this.conflicts.shift();
            if (pick === 'b')
                changed.push(key);
        }
        return Object.freeze(changed.sort());
    }
}
/** Observed-remove set: concurrent add and remove of the same element resolve to "present" (add wins). */
export class ObservedRemoveSet {
    replicaId;
    adds = new Map(); // element -> live tags
    tombstones = new Set();
    counter = 0;
    constructor(replicaId) {
        this.replicaId = replicaId;
    }
    add(element) { const tag = `${this.replicaId}:${++this.counter}`; (this.adds.get(element) ?? this.adds.set(element, new Set()).get(element)).add(tag); return tag; }
    remove(element) { for (const t of this.adds.get(element) ?? [])
        this.tombstones.add(t); }
    has(element) { return [...(this.adds.get(element) ?? [])].some((t) => !this.tombstones.has(t)); }
    elements() { return Object.freeze([...this.adds.keys()].filter((e) => this.has(e)).sort()); }
    state() { return { adds: Object.fromEntries([...this.adds].map(([k, v]) => [k, [...v].sort()])), tombstones: [...this.tombstones].sort() }; }
    merge(other) {
        for (const [e, tags] of Object.entries(other.adds)) {
            const s = this.adds.get(e) ?? new Set();
            for (const t of tags)
                s.add(t);
            this.adds.set(e, s);
        }
        for (const t of other.tombstones)
            this.tombstones.add(t);
    }
}
//# sourceMappingURL=consistency.js.map