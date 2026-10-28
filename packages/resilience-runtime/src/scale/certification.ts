/**
 * Phase 150 — Global Platform Readiness & Final Architecture Certification.
 *
 * Aggregates the evidence the platform can honestly produce — per-phase
 * implementation and CI evidence, architecture-guard results, authority
 * invariants, and operational drills — into a readiness verdict. The verdict
 * is derived, never asserted: any missing exact-SHA CI evidence or failed
 * invariant keeps the platform at PARTIAL/NOT-READY, and the report says why.
 */

import { createHash } from 'node:crypto';

export interface PhaseEvidence { readonly phase: number; readonly implemented: boolean; readonly testsPassed: boolean; readonly docPresent: boolean; readonly ciSha?: string }
export interface InvariantResult { readonly id: string; readonly description: string; readonly holds: boolean; readonly detail?: string }
export interface DrillResult { readonly id: string; readonly kind: 'backup-restore' | 'failover' | 'rollback' | 'overload' | 'tamper-detection'; readonly passed: boolean; readonly atMs: number }

export const REQUIRED_INVARIANTS: readonly string[] = Object.freeze([
  'single-mutation-authority', 'single-route-selection-boundary', 'ai-advisory-only', 'no-forbidden-architecture-symbols', 'secrets-never-logged', 'fail-closed-defaults',
]);
export const REQUIRED_DRILLS: readonly DrillResult['kind'][] = Object.freeze(['backup-restore', 'failover', 'rollback', 'overload', 'tamper-detection']);

export type PlatformReadinessVerdict = 'READY' | 'PARTIAL' | 'NOT-READY';
export interface PlatformReadinessInput {
  readonly firstPhase: number; readonly lastPhase: number;
  readonly phases: readonly PhaseEvidence[];
  readonly invariants: readonly InvariantResult[];
  readonly drills: readonly DrillResult[];
  readonly expectedCiSha?: string;
  readonly drillMaxAgeMs: number;
  readonly nowMs: number;
}
export interface PlatformReadinessReport {
  readonly verdict: PlatformReadinessVerdict;
  readonly blockers: readonly string[];
  readonly partials: readonly string[];
  readonly phaseCoverage: { readonly total: number; readonly implemented: number; readonly tested: number; readonly documented: number; readonly ciVerified: number };
  readonly digest: string;
}

export const assessPlatformReadiness = (i: PlatformReadinessInput): PlatformReadinessReport => {
  const blockers: string[] = []; const partials: string[] = [];
  const byPhase = new Map(i.phases.map((p) => [p.phase, p]));
  let implemented = 0; let tested = 0; let documented = 0; let ci = 0; const total = i.lastPhase - i.firstPhase + 1;
  for (let n = i.firstPhase; n <= i.lastPhase; n += 1) {
    const p = byPhase.get(n);
    if (!p) { blockers.push(`phase ${n}: no evidence`); continue; }
    if (p.implemented) implemented += 1; else blockers.push(`phase ${n}: not implemented`);
    if (p.testsPassed) tested += 1; else blockers.push(`phase ${n}: tests not passing`);
    if (p.docPresent) documented += 1; else partials.push(`phase ${n}: documentation missing`);
    if (p.ciSha && i.expectedCiSha && p.ciSha === i.expectedCiSha) ci += 1;
  }
  if (ci < total) partials.push(`exact-SHA CI evidence present for ${ci}/${total} phases${i.expectedCiSha ? '' : ' (no expected SHA supplied)'}`);
  const inv = new Map(i.invariants.map((x) => [x.id, x]));
  for (const id of REQUIRED_INVARIANTS) {
    const x = inv.get(id);
    if (!x) blockers.push(`invariant ${id}: not evaluated`); else if (!x.holds) blockers.push(`invariant ${id}: violated${x.detail ? ` (${x.detail})` : ''}`);
  }
  for (const kind of REQUIRED_DRILLS) {
    const latest = i.drills.filter((d) => d.kind === kind).sort((a, b) => b.atMs - a.atMs)[0];
    if (!latest) partials.push(`drill ${kind}: never run`);
    else if (!latest.passed) blockers.push(`drill ${kind}: latest run failed`);
    else if (i.nowMs - latest.atMs > i.drillMaxAgeMs) partials.push(`drill ${kind}: stale`);
  }
  const verdict: PlatformReadinessVerdict = blockers.length ? 'NOT-READY' : partials.length ? 'PARTIAL' : 'READY';
  const phaseCoverage = Object.freeze({ total, implemented, tested, documented, ciVerified: ci });
  const digest = createHash('sha256').update(JSON.stringify([verdict, blockers, partials, phaseCoverage])).digest('hex');
  return Object.freeze({ verdict, blockers: Object.freeze(blockers), partials: Object.freeze(partials), phaseCoverage, digest });
};

/** Checks that no module under the given sources imports a forbidden architecture symbol. Pure over supplied file contents. */
export const scanForbiddenSymbols = (files: Readonly<Record<string, string>>, forbidden: readonly string[]): readonly { readonly file: string; readonly symbol: string; readonly line: number }[] => {
  const hits: { file: string; symbol: string; line: number }[] = [];
  for (const [file, content] of Object.entries(files)) {
    content.split('\n').forEach((text, idx) => {
      if (!/^\s*(import|export)\b/.test(text)) return;
      for (const s of forbidden) if (new RegExp(`\\b${s}\\b`).test(text)) hits.push({ file, symbol: s, line: idx + 1 });
    });
  }
  return Object.freeze(hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line));
};
