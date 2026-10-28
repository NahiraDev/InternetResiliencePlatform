/**
 * Phase 143 — Auditability & Immutable Control History.
 *
 * An append-only, hash-chained and HMAC-sealed history of control decisions.
 * Each entry commits to its predecessor, so any edit, deletion, reordering or
 * insertion is detected by `verify`. Signed checkpoints allow pruning of old
 * segments while keeping the remaining history verifiable.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface HistoryEntry {
  readonly index: number;
  readonly atMs: number;
  readonly actor: string;
  readonly action: string;
  readonly subject: string;
  readonly outcome: 'allowed' | 'denied' | 'applied' | 'reverted' | 'failed';
  readonly detail: Readonly<Record<string, string | number | boolean>>;
  readonly previousHash: string;
  readonly hash: string;
  readonly seal: string;
}

export interface HistoryCheckpoint { readonly upToIndex: number; readonly hash: string; readonly atMs: number; readonly seal: string }
export type HistoryVerification = { readonly ok: true; readonly entries: number } | { readonly ok: false; readonly index: number; readonly reason: 'hash-mismatch' | 'chain-broken' | 'bad-seal' | 'index-gap' | 'checkpoint-mismatch' };

export const GENESIS_HASH = '0'.repeat(64);

const canonical = (e: Omit<HistoryEntry, 'hash' | 'seal'>): string => JSON.stringify([e.index, e.atMs, e.actor, e.action, e.subject, e.outcome, Object.entries(e.detail).sort(([a], [b]) => a.localeCompare(b)), e.previousHash]);
const sealOf = (key: Buffer | string, hash: string): string => createHmac('sha256', key).update(hash).digest('hex');
const eq = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export class ImmutableHistory {
  private entries: HistoryEntry[] = [];
  private base: HistoryCheckpoint | undefined;
  constructor(private readonly sealKey: Buffer | string, private readonly capacity = 1_000_000) {}

  append(input: { readonly atMs: number; readonly actor: string; readonly action: string; readonly subject: string; readonly outcome: HistoryEntry['outcome']; readonly detail?: HistoryEntry['detail'] }): HistoryEntry {
    if (this.entries.length >= this.capacity) throw new Error('history capacity reached; checkpoint and prune before appending');
    const last = this.entries[this.entries.length - 1];
    const body = { index: last ? last.index + 1 : (this.base?.upToIndex ?? -1) + 1, atMs: input.atMs, actor: input.actor, action: input.action, subject: input.subject, outcome: input.outcome, detail: Object.freeze({ ...(input.detail ?? {}) }), previousHash: last?.hash ?? this.base?.hash ?? GENESIS_HASH };
    const hash = createHash('sha256').update(canonical(body)).digest('hex');
    const entry: HistoryEntry = Object.freeze({ ...body, hash, seal: sealOf(this.sealKey, hash) });
    this.entries.push(entry);
    return entry;
  }

  verify(entries: readonly HistoryEntry[] = this.entries, anchor: HistoryCheckpoint | undefined = this.base): HistoryVerification {
    let prev = anchor?.hash ?? GENESIS_HASH; let expected = (anchor?.upToIndex ?? -1) + 1;
    if (anchor && !eq(anchor.seal, sealOf(this.sealKey, `cp:${anchor.upToIndex}:${anchor.hash}:${anchor.atMs}`))) return { ok: false, index: anchor.upToIndex, reason: 'checkpoint-mismatch' };
    for (const e of entries) {
      if (e.index !== expected) return { ok: false, index: e.index, reason: 'index-gap' };
      if (e.previousHash !== prev) return { ok: false, index: e.index, reason: 'chain-broken' };
      const { hash, seal, ...body } = e;
      if (createHash('sha256').update(canonical(body)).digest('hex') !== hash) return { ok: false, index: e.index, reason: 'hash-mismatch' };
      if (!eq(seal, sealOf(this.sealKey, hash))) return { ok: false, index: e.index, reason: 'bad-seal' };
      prev = hash; expected += 1;
    }
    return { ok: true, entries: entries.length };
  }

  /** Signs a checkpoint at the current head. */
  checkpoint(nowMs: number): HistoryCheckpoint {
    const last = this.entries[this.entries.length - 1];
    if (!last) throw new Error('nothing to checkpoint');
    return Object.freeze({ upToIndex: last.index, hash: last.hash, atMs: nowMs, seal: sealOf(this.sealKey, `cp:${last.index}:${last.hash}:${nowMs}`) });
  }

  /** Drops entries up to and including the checkpoint; the remainder stays verifiable from it. */
  prune(cp: HistoryCheckpoint): number {
    if (!eq(cp.seal, sealOf(this.sealKey, `cp:${cp.upToIndex}:${cp.hash}:${cp.atMs}`))) throw new Error('invalid checkpoint seal');
    const at = this.entries.findIndex((e) => e.index === cp.upToIndex);
    if (at < 0 || this.entries[at]?.hash !== cp.hash) throw new Error('checkpoint does not match history');
    const removed = this.entries.splice(0, at + 1).length;
    this.base = cp;
    return removed;
  }

  all(): readonly HistoryEntry[] { return Object.freeze([...this.entries]); }
  query(filter: { readonly actor?: string; readonly action?: string; readonly subject?: string; readonly sinceMs?: number; readonly untilMs?: number }): readonly HistoryEntry[] {
    return Object.freeze(this.entries.filter((e) => (!filter.actor || e.actor === filter.actor) && (!filter.action || e.action === filter.action) && (!filter.subject || e.subject === filter.subject) && (filter.sinceMs === undefined || e.atMs >= filter.sinceMs) && (filter.untilMs === undefined || e.atMs < filter.untilMs)));
  }
  head(): string { return this.entries[this.entries.length - 1]?.hash ?? this.base?.hash ?? GENESIS_HASH; }
}
