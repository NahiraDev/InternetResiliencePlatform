/**
 * Phase 121 — Network Knowledge Base.
 *
 * Entity-centric query layer over the existing `KnowledgeStore`. It adds no new
 * store: records are admitted, decayed, expired and arbitrated by the canonical
 * knowledge plane. The knowledge base answers "what do we know about this
 * destination / provider / path" with provenance, confidence and failure memory.
 */

import { decayedConfidence, type KnowledgeRecord, type KnowledgeScope, type KnowledgeSource } from '../knowledge/knowledge-record.js';
import type { KnowledgeStore } from '../knowledge/knowledge-store.js';

export type EntityKind = 'destination' | 'provider' | 'path' | 'region';

export interface EntityRef { readonly kind: EntityKind; readonly id: string }

export interface EntityProfile {
  readonly entity: EntityRef;
  readonly recordCount: number;
  readonly bySource: Readonly<Record<string, number>>;
  readonly byKind: Readonly<Record<string, number>>;
  /** Confidence-weighted mean of the named objective's evidence in [0,1]. */
  readonly objectiveEvidence: Readonly<Record<string, number>>;
  readonly meanConfidence: number;
  readonly newestObservedAt?: string;
  readonly advisoryOnlyRatio: number;
  readonly failureSignals: number;
  readonly corroborated: number;
}

const scopeFor = (e: EntityRef): KnowledgeScope => {
  switch (e.kind) {
    case 'destination': return { destination: e.id };
    case 'provider': return { providerId: e.id };
    case 'path': return { pathId: e.id };
    case 'region': return { region: e.id };
  }
};

const ADVISORY: readonly KnowledgeSource[] = ['federated', 'history'];

export class NetworkKnowledgeBase {
  constructor(private readonly store: KnowledgeStore, private readonly clock: () => number = () => Date.now()) {}

  /** Live (non-expired) records whose declared scope matches the entity. */
  factsFor(entity: EntityRef, nowMs: number = this.clock()): readonly KnowledgeRecord[] {
    const active = scopeFor(entity);
    const key = Object.keys(active)[0] as keyof KnowledgeScope;
    // A fact belongs to an entity when it declares that entity in its own scope dimension.
    return Object.freeze(this.store.query({ nowMs }).filter((r) => r.scope[key] === active[key]));
  }

  profile(entity: EntityRef, nowMs: number = this.clock()): EntityProfile {
    const facts = this.factsFor(entity, nowMs);
    const bySource: Record<string, number> = {};
    const byKind: Record<string, number> = {};
    const evidenceSum: Record<string, { w: number; v: number }> = {};
    let confSum = 0; let advisory = 0; let failures = 0; let corroborated = 0; let newest: string | undefined;
    for (const f of facts) {
      bySource[f.source] = (bySource[f.source] ?? 0) + 1;
      byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
      const c = decayedConfidence(f, nowMs);
      confSum += c;
      if (ADVISORY.includes(f.source)) advisory += 1;
      if (f.source === 'failure-memory' || f.detail?.status === 'failed') failures += 1;
      if (f.corroborations.length > 0) corroborated += 1;
      if (!newest || Date.parse(f.observedAt) > Date.parse(newest)) newest = f.observedAt;
      for (const [k, v] of Object.entries(f.objectiveEvidence ?? {})) {
        if (typeof v !== 'number') continue;
        const cur = evidenceSum[k] ?? { w: 0, v: 0 };
        cur.w += c; cur.v += c * v; evidenceSum[k] = cur;
      }
    }
    const objectiveEvidence = Object.fromEntries(Object.entries(evidenceSum).filter(([, x]) => x.w > 0).map(([k, x]) => [k, x.v / x.w]).sort(([a], [b]) => (a as string).localeCompare(b as string)));
    return Object.freeze({
      entity, recordCount: facts.length, bySource: Object.freeze(bySource), byKind: Object.freeze(byKind),
      objectiveEvidence: Object.freeze(objectiveEvidence) as Readonly<Record<string, number>>,
      meanConfidence: facts.length ? confSum / facts.length : 0, ...(newest ? { newestObservedAt: newest } : {}),
      advisoryOnlyRatio: facts.length ? advisory / facts.length : 0, failureSignals: failures, corroborated,
    });
  }

  /** Entities of a kind ranked by failure signals then recency; useful for "where do we keep failing". */
  rankByFailures(kind: EntityKind, nowMs: number = this.clock(), limit = 10): readonly EntityProfile[] {
    const ids = new Set<string>();
    for (const r of this.store.query({ nowMs })) {
      const v = kind === 'destination' ? r.scope.destination : kind === 'provider' ? r.scope.providerId : kind === 'path' ? r.scope.pathId : r.scope.region;
      if (v) ids.add(v);
    }
    return Object.freeze([...ids].map((id) => this.profile({ kind, id }, nowMs)).filter((p) => p.failureSignals > 0)
      .sort((a, b) => b.failureSignals - a.failureSignals || (b.newestObservedAt ?? '').localeCompare(a.newestObservedAt ?? '') || a.entity.id.localeCompare(b.entity.id)).slice(0, limit));
  }

  /** Human-readable, provenance-bearing explanation suitable for operators and audit. */
  explain(entity: EntityRef, nowMs: number = this.clock()): string {
    const p = this.profile(entity, nowMs);
    if (p.recordCount === 0) return `No live knowledge about ${entity.kind} ${entity.id}.`;
    const sources = Object.entries(p.bySource).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join(', ');
    return `${entity.kind} ${entity.id}: ${p.recordCount} live records (${sources}); mean confidence ${p.meanConfidence.toFixed(2)}; ${p.failureSignals} failure signals; ${(p.advisoryOnlyRatio * 100).toFixed(0)}% advisory-only.`;
  }
}
