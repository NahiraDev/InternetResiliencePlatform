/**
 * Phase 144 — Privacy/Security Governance Controls.
 *
 * Executable governance rules over access grants and data use: purpose
 * limitation, separation of duties, stale-access review, break-glass expiry
 * and least privilege. Each control returns structured findings with severity,
 * so results can feed the compliance evidence framework.
 */
import type { DataClass } from './data-lifecycle.js';
export type GovernanceSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export interface Finding {
    readonly control: string;
    readonly severity: GovernanceSeverity;
    readonly subject: string;
    readonly message: string;
}
export interface AccessGrant {
    readonly actor: string;
    readonly capability: string;
    readonly grantedAtMs: number;
    readonly expiresAtMs?: number;
    readonly lastUsedAtMs?: number;
    readonly breakGlass?: boolean;
}
export interface DataUse {
    readonly actor: string;
    readonly dataClass: DataClass;
    readonly purpose: string;
    readonly atMs: number;
}
export interface GovernancePolicy {
    /** Pairs of capabilities one actor must never hold together. */
    readonly conflictingCapabilities: readonly (readonly [string, string])[];
    readonly allowedPurposes: Readonly<Record<DataClass, readonly string[]>>;
    readonly staleAfterMs: number;
    readonly maxBreakGlassMs: number;
    readonly maxGrantsPerActor: number;
}
export declare const checkSeparationOfDuties: (grants: readonly AccessGrant[], policy: GovernancePolicy, nowMs: number) => readonly Finding[];
export declare const checkPurposeLimitation: (uses: readonly DataUse[], policy: GovernancePolicy) => readonly Finding[];
export declare const checkAccessReview: (grants: readonly AccessGrant[], policy: GovernancePolicy, nowMs: number) => readonly Finding[];
export declare const checkLeastPrivilege: (grants: readonly AccessGrant[], policy: GovernancePolicy, nowMs: number) => readonly Finding[];
export interface GovernanceReport {
    readonly findings: readonly Finding[];
    readonly bySeverity: Readonly<Record<GovernanceSeverity, number>>;
    readonly pass: boolean;
}
export declare const runGovernanceReview: (grants: readonly AccessGrant[], uses: readonly DataUse[], policy: GovernancePolicy, nowMs: number) => GovernanceReport;
//# sourceMappingURL=governance-controls.d.ts.map