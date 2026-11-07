/**
 * Phase 131 — Service/Application Policy Enforcement.
 *
 * Per-application path policies (allowed resource kinds, required trust,
 * excluded failure domains, maximum cost, pinning) evaluated against candidate
 * fabric resources and compiled into data-plane steering rules. Conflicting
 * policies are detected rather than resolved silently.
 */
import type { FabricResource, FabricResourceKind } from '../fabric.js';
import type { DataPlaneRule } from './abstraction.js';
export interface ApplicationPolicy {
    readonly application: string;
    readonly destinationCidrs: readonly string[];
    readonly allowedKinds?: readonly FabricResourceKind[];
    readonly minimumTrust?: number;
    readonly maximumCost?: number;
    readonly excludedFailureDomains?: readonly string[];
    readonly requiredFailureDomains?: readonly string[];
    /** Hard pin: the only acceptable resource id. */
    readonly pinnedResourceId?: string;
    readonly priority: number;
}
export interface PolicyViolation {
    readonly resourceId: string;
    readonly reasons: readonly string[];
}
export interface ApplicationPolicyEvaluation {
    readonly application: string;
    readonly permitted: readonly FabricResource[];
    readonly violations: readonly PolicyViolation[];
}
export declare const evaluateApplicationPolicy: (policy: ApplicationPolicy, candidates: readonly FabricResource[]) => ApplicationPolicyEvaluation;
export interface PolicyConflict {
    readonly a: string;
    readonly b: string;
    readonly reason: string;
}
/** Detects policies that can never be satisfied together for the same destinations. */
export declare const detectPolicyConflicts: (policies: readonly ApplicationPolicy[]) => readonly PolicyConflict[];
/** Steering rules for the chosen permitted resource of each policy; policies with no permitted resource produce no rule (fail closed to existing routing). */
export declare const compileSteeringRules: (policies: readonly ApplicationPolicy[], chosen: Readonly<Record<string, string | undefined>>, owner: string) => readonly DataPlaneRule[];
//# sourceMappingURL=app-policy.d.ts.map