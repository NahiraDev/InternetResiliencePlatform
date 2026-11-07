/**
 * Phase 145 — Compliance & Operational Evidence Framework.
 *
 * Maps controls to evidence items with freshness requirements, flags missing,
 * stale and failing controls, and seals an evidence bundle with a content
 * digest and HMAC so it can be handed to an assessor and verified later.
 * It records evidence of what exists; it never asserts certification.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
export const evidenceDigest = (content) => createHash('sha256').update(content).digest('hex');
export const assessControls = (controls, evidence, nowMs) => Object.freeze(controls.map((c) => {
    const mine = evidence.filter((e) => e.controlIds.includes(c.id));
    const missing = [];
    const stale = [];
    const failing = [];
    for (const kind of c.requiredEvidence) {
        const ofKind = mine.filter((e) => e.kind === kind).sort((a, b) => b.collectedAtMs - a.collectedAtMs);
        const latest = ofKind[0];
        if (!latest) {
            missing.push(kind);
            continue;
        }
        if (nowMs - latest.collectedAtMs > c.maxAgeMs)
            stale.push(kind);
        if (latest.result === 'fail')
            failing.push(latest.id);
    }
    const status = failing.length ? 'failing' : missing.length ? 'missing-evidence' : stale.length ? 'stale-evidence' : 'satisfied';
    return Object.freeze({ controlId: c.id, status, missingKinds: Object.freeze(missing.sort()), staleKinds: Object.freeze(stale.sort()), failingEvidence: Object.freeze(failing.sort()) });
}).sort((a, b) => a.controlId.localeCompare(b.controlId)));
const bundleBody = (b) => JSON.stringify([b.generatedAtMs, b.assessments, [...b.evidence].sort((x, y) => x.id.localeCompare(y.id))]);
export const sealEvidenceBundle = (controls, evidence, nowMs, key) => {
    const assessments = assessControls(controls, evidence, nowMs);
    const referenced = new Set(assessments.length ? evidence.filter((e) => e.controlIds.some((id) => controls.some((c) => c.id === id))).map((e) => e.id) : []);
    const body = { generatedAtMs: nowMs, assessments, evidence: Object.freeze(evidence.filter((e) => referenced.has(e.id))) };
    const digest = createHash('sha256').update(bundleBody(body)).digest('hex');
    const coverage = controls.length === 0 ? 1 : assessments.filter((a) => a.status === 'satisfied').length / controls.length;
    return Object.freeze({ ...body, coverage, digest, seal: createHmac('sha256', key).update(digest).digest('hex') });
};
export const verifyEvidenceBundle = (b, key) => {
    const digest = createHash('sha256').update(bundleBody(b)).digest('hex');
    if (digest !== b.digest)
        return false;
    const expected = Buffer.from(createHmac('sha256', key).update(digest).digest('hex'), 'hex');
    const given = Buffer.from(b.seal, 'hex');
    return expected.length === given.length && timingSafeEqual(expected, given);
};
/** A plain-language gap list: what must be collected or fixed before the bundle can show full coverage. */
export const gapReport = (assessments) => Object.freeze(assessments.flatMap((a) => a.status === 'satisfied' ? [] : [
    ...a.missingKinds.map((k) => `${a.controlId}: collect ${k} evidence`),
    ...a.staleKinds.map((k) => `${a.controlId}: refresh ${k} evidence`),
    ...a.failingEvidence.map((e) => `${a.controlId}: remediate failing evidence ${e}`),
]));
//# sourceMappingURL=compliance-evidence.js.map