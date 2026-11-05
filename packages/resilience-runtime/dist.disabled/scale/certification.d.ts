/**
 * Phase 150 — Global Platform Readiness & Final Architecture Certification.
 *
 * Aggregates the evidence the platform can honestly produce — per-phase
 * implementation and CI evidence, architecture-guard results, authority
 * invariants, and operational drills — into a readiness verdict. The verdict
 * is derived, never asserted: any missing exact-SHA CI evidence or failed
 * invariant keeps the platform at PARTIAL/NOT-READY, and the report says why.
 */
export interface PhaseEvidence {
    readonly phase: number;
    readonly implemented: boolean;
    readonly testsPassed: boolean;
    readonly docPresent: boolean;
    readonly ciSha?: string;
}
export interface InvariantResult {
    readonly id: string;
    readonly description: string;
    readonly holds: boolean;
    readonly detail?: string;
}
export interface DrillResult {
    readonly id: string;
    readonly kind: 'backup-restore' | 'failover' | 'rollback' | 'overload' | 'tamper-detection';
    readonly passed: boolean;
    readonly atMs: number;
}
export declare const REQUIRED_INVARIANTS: readonly string[];
export declare const REQUIRED_DRILLS: readonly DrillResult['kind'][];
export type PlatformReadinessVerdict = 'READY' | 'PARTIAL' | 'NOT-READY';
export interface PlatformReadinessInput {
    readonly firstPhase: number;
    readonly lastPhase: number;
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
    readonly phaseCoverage: {
        readonly total: number;
        readonly implemented: number;
        readonly tested: number;
        readonly documented: number;
        readonly ciVerified: number;
    };
    readonly digest: string;
}
export declare const assessPlatformReadiness: (i: PlatformReadinessInput) => PlatformReadinessReport;
/** Checks that no module under the given sources imports a forbidden architecture symbol. Pure over supplied file contents. */
export declare const scanForbiddenSymbols: (files: Readonly<Record<string, string>>, forbidden: readonly string[]) => readonly {
    readonly file: string;
    readonly symbol: string;
    readonly line: number;
}[];
//# sourceMappingURL=certification.d.ts.map