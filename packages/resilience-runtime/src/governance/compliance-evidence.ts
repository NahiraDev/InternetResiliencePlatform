/**
 * Phase 145 — Compliance & Operational Evidence Framework.
 *
 * Maps controls to evidence items with freshness requirements, flags missing,
 * stale and failing controls, and seals an evidence bundle with a content
 * digest and HMAC so it can be handed to an assessor and verified later.
 * It records evidence of what exists; it never asserts certification.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface ControlDefinition { readonly id: string; readonly title: string; readonly requiredEvidence: readonly string[]; readonly maxAgeMs: number }
export interface EvidenceItem { readonly id: string; readonly kind: string; readonly controlIds: readonly string[]; readonly collectedAtMs: number; readonly result: 'pass' | 'fail' | 'informational'; readonly digest: string; readonly source: string }
export type ControlStatus = 'satisfied' | 'missing-evidence' | 'stale-evidence' | 'failing';
export interface ControlAssessment { readonly controlId: string; readonly status: ControlStatus; readonly missingKinds: readonly string[]; readonly staleKinds: readonly string[]; readonly failingEvidence: readonly string[] }

export const evidenceDigest = (content: string | Buffer): string => createHash('sha256').update(content).digest('hex');

export const assessControls = (controls: readonly ControlDefinition[], evidence: readonly EvidenceItem[], nowMs: number): readonly ControlAssessment[] =>
  Object.freeze(controls.map((c): ControlAssessment => {
    const mine = evidence.filter((e) => e.controlIds.includes(c.id));
    const missing: string[] = []; const stale: string[] = []; const failing: string[] = [];
    for (const kind of c.requiredEvidence) {
      const ofKind = mine.filter((e) => e.kind === kind).sort((a, b) => b.collectedAtMs - a.collectedAtMs);
      const latest = ofKind[0];
      if (!latest) { missing.push(kind); continue; }
      if (nowMs - latest.collectedAtMs > c.maxAgeMs) stale.push(kind);
      if (latest.result === 'fail') failing.push(latest.id);
    }
    const status: ControlStatus = failing.length ? 'failing' : missing.length ? 'missing-evidence' : stale.length ? 'stale-evidence' : 'satisfied';
    return Object.freeze({ controlId: c.id, status, missingKinds: Object.freeze(missing.sort()), staleKinds: Object.freeze(stale.sort()), failingEvidence: Object.freeze(failing.sort()) });
  }).sort((a, b) => a.controlId.localeCompare(b.controlId)));

export interface EvidenceBundle { readonly generatedAtMs: number; readonly assessments: readonly ControlAssessment[]; readonly evidence: readonly EvidenceItem[]; readonly coverage: number; readonly digest: string; readonly seal: string }

const bundleBody = (b: Pick<EvidenceBundle, 'generatedAtMs' | 'assessments' | 'evidence'>): string => JSON.stringify([b.generatedAtMs, b.assessments, [...b.evidence].sort((x, y) => x.id.localeCompare(y.id))]);

export const sealEvidenceBundle = (controls: readonly ControlDefinition[], evidence: readonly EvidenceItem[], nowMs: number, key: Buffer | string): EvidenceBundle => {
  const assessments = assessControls(controls, evidence, nowMs);
  const referenced = new Set(assessments.length ? evidence.filter((e) => e.controlIds.some((id) => controls.some((c) => c.id === id))).map((e) => e.id) : []);
  const body = { generatedAtMs: nowMs, assessments, evidence: Object.freeze(evidence.filter((e) => referenced.has(e.id))) };
  const digest = createHash('sha256').update(bundleBody(body)).digest('hex');
  const coverage = controls.length === 0 ? 1 : assessments.filter((a) => a.status === 'satisfied').length / controls.length;
  return Object.freeze({ ...body, coverage, digest, seal: createHmac('sha256', key).update(digest).digest('hex') });
};

export const verifyEvidenceBundle = (b: EvidenceBundle, key: Buffer | string): boolean => {
  const digest = createHash('sha256').update(bundleBody(b)).digest('hex');
  if (digest !== b.digest) return false;
  const expected = Buffer.from(createHmac('sha256', key).update(digest).digest('hex'), 'hex'); const given = Buffer.from(b.seal, 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
};

/** A plain-language gap list: what must be collected or fixed before the bundle can show full coverage. */
export const gapReport = (assessments: readonly ControlAssessment[]): readonly string[] =>
  Object.freeze(assessments.flatMap((a) => a.status === 'satisfied' ? [] : [
    ...a.missingKinds.map((k) => `${a.controlId}: collect ${k} evidence`),
    ...a.staleKinds.map((k) => `${a.controlId}: refresh ${k} evidence`),
    ...a.failingEvidence.map((e) => `${a.controlId}: remediate failing evidence ${e}`),
  ]));
