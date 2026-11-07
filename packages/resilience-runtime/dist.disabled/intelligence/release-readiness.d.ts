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
export declare const DEFAULT_RELEASE_GATES: readonly GateRequirement[];
export type GateVerdict = 'passed' | 'failed' | 'missing' | 'stale' | 'sha-mismatch' | 'untrusted-source' | 'skipped';
export interface GateAssessment {
    readonly gate: string;
    readonly verdict: GateVerdict;
    readonly optional: boolean;
    readonly evidence?: GateEvidence;
    readonly detail: string;
}
export interface ReadinessReport {
    readonly candidateSha: string;
    readonly verdict: 'ready' | 'blocked' | 'ready-with-warnings';
    readonly gates: readonly GateAssessment[];
    readonly blockers: readonly string[];
    readonly warnings: readonly string[];
    readonly evaluatedAtMs: number;
}
export declare const evaluateReleaseReadiness: (candidateSha: string, evidence: readonly GateEvidence[], nowMs: number, requirements?: readonly GateRequirement[]) => ReadinessReport;
//# sourceMappingURL=release-readiness.d.ts.map