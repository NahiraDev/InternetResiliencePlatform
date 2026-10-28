/**
 * Phase 142 — Data Classification, Retention & Deletion.
 *
 * Classification levels with per-class retention, legal holds, a deletion
 * planner that never deletes held or still-retained records, and tamper-evident
 * deletion receipts. The planner is pure; executing a plan is the store's job.
 */

import { createHash } from 'node:crypto';

export type DataClass = 'public' | 'internal' | 'confidential' | 'restricted';
const RANK: Readonly<Record<DataClass, number>> = { public: 0, internal: 1, confidential: 2, restricted: 3 };

export interface RetentionRule { readonly dataClass: DataClass; readonly retainMs: number; readonly maxRetainMs: number }
export interface DataRecordMeta { readonly id: string; readonly dataClass: DataClass; readonly createdAtMs: number; readonly subject?: string; readonly tenant?: string }
export interface LegalHold { readonly id: string; readonly reason: string; readonly tenant?: string; readonly subject?: string; readonly releasedAtMs?: number }

export const DEFAULT_RETENTION: readonly RetentionRule[] = Object.freeze([
  { dataClass: 'public', retainMs: 365 * 86_400_000, maxRetainMs: 5 * 365 * 86_400_000 },
  { dataClass: 'internal', retainMs: 180 * 86_400_000, maxRetainMs: 2 * 365 * 86_400_000 },
  { dataClass: 'confidential', retainMs: 90 * 86_400_000, maxRetainMs: 365 * 86_400_000 },
  { dataClass: 'restricted', retainMs: 30 * 86_400_000, maxRetainMs: 90 * 86_400_000 },
] as readonly RetentionRule[]);

export const validateRetention = (rules: readonly RetentionRule[]): readonly string[] => {
  const v: string[] = [];
  for (const r of rules) if (!(r.retainMs > 0) || r.maxRetainMs < r.retainMs) v.push(`${r.dataClass}: invalid retention window`);
  const sorted = [...rules].sort((a, b) => RANK[a.dataClass] - RANK[b.dataClass]);
  for (let i = 1; i < sorted.length; i += 1) if ((sorted[i] as RetentionRule).maxRetainMs > (sorted[i - 1] as RetentionRule).maxRetainMs) v.push(`${(sorted[i] as RetentionRule).dataClass}: more sensitive data may not be kept longer than less sensitive data`);
  for (const c of Object.keys(RANK) as DataClass[]) if (!rules.some((r) => r.dataClass === c)) v.push(`${c}: no retention rule`);
  return Object.freeze(v);
};

export interface DeletionPlan { readonly delete: readonly string[]; readonly retained: readonly string[]; readonly held: readonly { readonly id: string; readonly holdId: string }[]; readonly overdue: readonly string[] }

const holdApplies = (h: LegalHold, r: DataRecordMeta, nowMs: number): boolean =>
  (h.releasedAtMs === undefined || h.releasedAtMs > nowMs) && (h.tenant === undefined || h.tenant === r.tenant) && (h.subject === undefined || h.subject === r.subject);

export const planDeletion = (records: readonly DataRecordMeta[], rules: readonly RetentionRule[], holds: readonly LegalHold[], nowMs: number, erasureSubjects: readonly string[] = []): DeletionPlan => {
  const bad = validateRetention(rules);
  if (bad.length) throw new Error(`invalid retention rules: ${bad.join('; ')}`);
  const rule = new Map(rules.map((r) => [r.dataClass, r]));
  const del: string[] = []; const retained: string[] = []; const held: { id: string; holdId: string }[] = []; const overdue: string[] = [];
  for (const r of [...records].sort((a, b) => a.id.localeCompare(b.id))) {
    const hold = holds.find((h) => holdApplies(h, r, nowMs));
    if (hold) { held.push({ id: r.id, holdId: hold.id }); if (nowMs - r.createdAtMs > (rule.get(r.dataClass) as RetentionRule).maxRetainMs) overdue.push(r.id); continue; }
    const age = nowMs - r.createdAtMs;
    const erased = r.subject !== undefined && erasureSubjects.includes(r.subject);
    if (erased || age >= (rule.get(r.dataClass) as RetentionRule).retainMs) del.push(r.id); else retained.push(r.id);
  }
  return Object.freeze({ delete: Object.freeze(del), retained: Object.freeze(retained), held: Object.freeze(held), overdue: Object.freeze(overdue) });
};

export interface DeletionReceipt { readonly recordId: string; readonly dataClass: DataClass; readonly deletedAtMs: number; readonly basis: 'retention-expired' | 'subject-erasure'; readonly digest: string }

/** A receipt proves a record was deleted without retaining its content: only a digest of its metadata. */
export const deletionReceipt = (r: DataRecordMeta, deletedAtMs: number, basis: DeletionReceipt['basis']): DeletionReceipt =>
  Object.freeze({ recordId: r.id, dataClass: r.dataClass, deletedAtMs, basis, digest: createHash('sha256').update(JSON.stringify([r.id, r.dataClass, r.createdAtMs, deletedAtMs, basis])).digest('hex') });

/** The strictest class wins when data of several classes is combined. */
export const combineClasses = (classes: readonly DataClass[]): DataClass => classes.reduce<DataClass>((m, c) => RANK[c] > RANK[m] ? c : m, 'public');
export const canFlow = (from: DataClass, to: DataClass): boolean => RANK[to] >= RANK[from];
