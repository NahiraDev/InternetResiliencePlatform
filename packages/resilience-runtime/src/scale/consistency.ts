/**
 * Phase 147 — Distributed State Consistency & Conflict Recovery.
 *
 * Version vectors detect concurrent writes precisely; non-concurrent updates
 * resolve by causality, concurrent ones by an explicit, deterministic policy
 * (never silently by wall clock alone) and are always reported as conflicts.
 * Also provides a grow/shrink-safe observed-remove set for replicated membership.
 */

export type VersionVector = Readonly<Record<string, number>>;
export type CausalOrder = 'equal' | 'before' | 'after' | 'concurrent';

export const compareVectors = (a: VersionVector, b: VersionVector): CausalOrder => {
  let aAhead = false; let bAhead = false;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] ?? 0; const y = b[k] ?? 0;
    if (x > y) aAhead = true; else if (y > x) bAhead = true;
  }
  return aAhead && bAhead ? 'concurrent' : aAhead ? 'after' : bAhead ? 'before' : 'equal';
};
export const mergeVectors = (a: VersionVector, b: VersionVector): VersionVector => {
  const out: Record<string, number> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = Math.max(a[k] ?? 0, b[k] ?? 0);
  return Object.freeze(out);
};
export const bump = (v: VersionVector, replica: string): VersionVector => Object.freeze({ ...v, [replica]: (v[replica] ?? 0) + 1 });

export interface Versioned<T> { readonly value: T; readonly vector: VersionVector; readonly writer: string; readonly atMs: number }
export interface ConflictRecord<T> { readonly key: string; readonly a: Versioned<T>; readonly b: Versioned<T>; readonly resolvedTo: 'a' | 'b'; readonly policy: string }
export type ConflictPolicy<T> = (a: Versioned<T>, b: Versioned<T>) => 'a' | 'b';

/** Deterministic default: later timestamp wins, ties broken by writer id; the loss is reported, never silent. */
export const lastWriterWins = <T>(a: Versioned<T>, b: Versioned<T>): 'a' | 'b' => a.atMs !== b.atMs ? (a.atMs > b.atMs ? 'a' : 'b') : a.writer >= b.writer ? 'a' : 'b';

export class ReplicatedMap<T> {
  private readonly data = new Map<string, Versioned<T>>();
  readonly conflicts: ConflictRecord<T>[] = [];
  constructor(readonly replicaId: string, private readonly policy: ConflictPolicy<T> = lastWriterWins, private readonly policyName = 'last-writer-wins', private readonly conflictCapacity = 1_000) {}

  set(key: string, value: T, nowMs: number): Versioned<T> {
    const prev = this.data.get(key);
    const next: Versioned<T> = Object.freeze({ value, vector: bump(prev?.vector ?? {}, this.replicaId), writer: this.replicaId, atMs: nowMs });
    this.data.set(key, next);
    return next;
  }
  get(key: string): T | undefined { return this.data.get(key)?.value; }
  entry(key: string): Versioned<T> | undefined { return this.data.get(key); }
  snapshot(): Readonly<Record<string, Versioned<T>>> { return Object.freeze(Object.fromEntries([...this.data].sort(([x], [y]) => x.localeCompare(y)))); }

  /** Merges a remote snapshot; returns the keys whose local value changed. Idempotent, commutative and associative. */
  merge(remote: Readonly<Record<string, Versioned<T>>>): readonly string[] {
    const changed: string[] = [];
    for (const [key, theirs] of Object.entries(remote)) {
      const mine = this.data.get(key);
      if (!mine) { this.data.set(key, theirs); changed.push(key); continue; }
      const order = compareVectors(mine.vector, theirs.vector);
      if (order === 'equal' || order === 'after') continue;
      if (order === 'before') { this.data.set(key, theirs); changed.push(key); continue; }
      const pick = this.policy(mine, theirs);
      const winner = pick === 'a' ? mine : theirs;
      this.data.set(key, Object.freeze({ ...winner, vector: mergeVectors(mine.vector, theirs.vector) }));
      this.conflicts.push(Object.freeze({ key, a: mine, b: theirs, resolvedTo: pick, policy: this.policyName }));
      while (this.conflicts.length > this.conflictCapacity) this.conflicts.shift();
      if (pick === 'b') changed.push(key);
    }
    return Object.freeze(changed.sort());
  }
}

/** Observed-remove set: concurrent add and remove of the same element resolve to "present" (add wins). */
export class ObservedRemoveSet {
  private readonly adds = new Map<string, Set<string>>(); // element -> live tags
  private readonly tombstones = new Set<string>();
  private counter = 0;
  constructor(readonly replicaId: string) {}
  add(element: string): string { const tag = `${this.replicaId}:${++this.counter}`; (this.adds.get(element) ?? this.adds.set(element, new Set()).get(element) as Set<string>).add(tag); return tag; }
  remove(element: string): void { for (const t of this.adds.get(element) ?? []) this.tombstones.add(t); }
  has(element: string): boolean { return [...(this.adds.get(element) ?? [])].some((t) => !this.tombstones.has(t)); }
  elements(): readonly string[] { return Object.freeze([...this.adds.keys()].filter((e) => this.has(e)).sort()); }
  state(): { readonly adds: Readonly<Record<string, readonly string[]>>; readonly tombstones: readonly string[] } { return { adds: Object.fromEntries([...this.adds].map(([k, v]) => [k, [...v].sort()])), tombstones: [...this.tombstones].sort() }; }
  merge(other: ReturnType<ObservedRemoveSet['state']>): void {
    for (const [e, tags] of Object.entries(other.adds)) { const s = this.adds.get(e) ?? new Set<string>(); for (const t of tags) s.add(t); this.adds.set(e, s); }
    for (const t of other.tombstones) this.tombstones.add(t);
  }
}
