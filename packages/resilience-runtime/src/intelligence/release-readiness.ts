/**
 * Phase 127 — Final Production Certification & Release Readiness.
 *
 * Evidence-based readiness evaluation. A gate passes only with evidence that is
 * bound to the exact candidate SHA, is recent enough, comes from an accepted
 * source and carries a passing result. Source presence, local runs on another
 * SHA and self-attested claims never count. The evaluator reports exactly which
 * gates are missing, stale, mismatched or failing; it cannot certify around them.
 */

export type GateSource = 'ci' | 'runtime-lab' | 'device' | 'security-review' | 'release-signing' | 'manual-attestation';

export interface GateEvidence {
  readonly gate: string;
  readonly sha: string;
  readonly source: GateSource;
  readonly result: 'pass' | 'fail' | 'skipped';
  readonly recordedAtMs: number;
  readonly reference: string;
}

export interface GateRequirement {
  readonly gate: string;
  readonly acceptedSources: readonly GateSource[];
  readonly maxAgeMs: number;
  /** Optional gates produce warnings, never blockers. */
  readonly optional?: boolean;
}

export const DEFAULT_RELEASE_GATES: readonly GateRequirement[] = Object.freeze([
  { gate: 'typecheck-and-unit', acceptedSources: ['ci'], maxAgeMs: 7 * 86_400_000 },
  { gate: 'architecture-guards', acceptedSources: ['ci'], maxAgeMs: 7 * 86_400_000 },
  { gate: 'linux-runtime-soak', acceptedSources: ['runtime-lab', 'device'], maxAgeMs: 14 * 86_400_000 },
  { gate: 'security-review', acceptedSources: ['security-review'], maxAgeMs: 30 * 86_400_000 },
  { gate: 'release-signing', acceptedSources: ['release-signing'], maxAgeMs: 7 * 86_400_000 },
  { gate: 'regional-validation', acceptedSources: ['device', 'runtime-lab'], maxAgeMs: 30 * 86_400_000, optional: true },
] as readonly GateRequirement[]);

export type GateVerdict = 'passed' | 'failed' | 'missing' | 'stale' | 'sha-mismatch' | 'untrusted-source' | 'skipped';

export interface GateAssessment { readonly gate: string; readonly verdict: GateVerdict; readonly optional: boolean; readonly evidence?: GateEvidence; readonly detail: string }

export interface ReadinessReport {
  readonly candidateSha: string;
  readonly verdict: 'ready' | 'blocked' | 'ready-with-warnings';
  readonly gates: readonly GateAssessment[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly evaluatedAtMs: number;
}

const SHA = /^[0-9a-f]{40}$/;

export const evaluateReleaseReadiness = (
  candidateSha: string, evidence: readonly GateEvidence[], nowMs: number, requirements: readonly GateRequirement[] = DEFAULT_RELEASE_GATES,
): ReadinessReport => {
  if (!SHA.test(candidateSha)) throw new Error('candidate SHA must be a full 40-character lowercase hex commit id');
  const gates: GateAssessment[] = requirements.map((req) => {
    const optional = req.optional === true;
    const forGate = evidence.filter((e) => e.gate === req.gate);
    const base = { gate: req.gate, optional };
    if (forGate.length === 0) return Object.freeze({ ...base, verdict: 'missing' as const, detail: 'no evidence recorded' });
    const exact = forGate.filter((e) => e.sha === candidateSha);
    if (exact.length === 0) return Object.freeze({ ...base, verdict: 'sha-mismatch' as const, evidence: newest(forGate), detail: `evidence is for ${newest(forGate).sha.slice(0, 7)}, not ${candidateSha.slice(0, 7)}` });
    const trusted = exact.filter((e) => req.acceptedSources.includes(e.source));
    if (trusted.length === 0) return Object.freeze({ ...base, verdict: 'untrusted-source' as const, evidence: newest(exact), detail: `source ${newest(exact).source} is not accepted for this gate` });
    const latest = newest(trusted);
    if (latest.result === 'fail') return Object.freeze({ ...base, verdict: 'failed' as const, evidence: latest, detail: `latest evidence failed (${latest.reference})` });
    if (latest.result === 'skipped') return Object.freeze({ ...base, verdict: 'skipped' as const, evidence: latest, detail: 'gate was skipped' });
    if (nowMs - latest.recordedAtMs > req.maxAgeMs) return Object.freeze({ ...base, verdict: 'stale' as const, evidence: latest, detail: 'evidence is older than the allowed age' });
    return Object.freeze({ ...base, verdict: 'passed' as const, evidence: latest, detail: latest.reference });
  });
  const blockers = gates.filter((g) => g.verdict !== 'passed' && !g.optional).map((g) => `${g.gate}:${g.verdict}`);
  const warnings = gates.filter((g) => g.verdict !== 'passed' && g.optional).map((g) => `${g.gate}:${g.verdict}`);
  return Object.freeze({
    candidateSha, verdict: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'ready-with-warnings' : 'ready',
    gates: Object.freeze(gates), blockers: Object.freeze(blockers), warnings: Object.freeze(warnings), evaluatedAtMs: nowMs,
  });
};

const newest = (list: readonly GateEvidence[]): GateEvidence => [...list].sort((a, b) => b.recordedAtMs - a.recordedAtMs || a.reference.localeCompare(b.reference))[0] as GateEvidence;
