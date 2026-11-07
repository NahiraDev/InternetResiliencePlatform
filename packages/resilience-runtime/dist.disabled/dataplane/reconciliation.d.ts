/**
 * Phase 134 — Data-Plane Assurance & Safe Reconciliation.
 *
 * Detects drift between desired and observed data-plane state and reconciles in
 * bounded, make-before-break passes with a dead-man switch: every applied pass
 * must be confirmed by a verification probe within a deadline or the inverse
 * plan is applied automatically. Reconciliation is a loop client only — passes
 * run through the Phase 128 governed apply path.
 */
import { type DataPlaneBackend, type DataPlanePlan, type DataPlaneRule } from './abstraction.js';
export interface DriftReport {
    readonly missing: readonly string[];
    readonly unexpected: readonly string[];
    readonly diverged: readonly string[];
    readonly inSync: boolean;
}
export declare const detectDrift: (desired: readonly DataPlaneRule[], observed: readonly DataPlaneRule[], owner: string) => DriftReport;
export interface ReconcileOptions {
    /** Maximum operations applied in one pass; larger plans are split across passes. */
    readonly maxOpsPerPass?: number;
    /** Verification must succeed within this time or the pass is reverted. */
    readonly confirmDeadlineMs?: number;
    readonly signal?: AbortSignal;
}
export interface VerificationPort {
    verify(rulesApplied: readonly DataPlaneRule[], signal: AbortSignal): Promise<boolean>;
}
export interface ReconcilePass {
    readonly status: 'in-sync' | 'confirmed' | 'reverted' | 'apply-failed' | 'revert-failed' | 'rejected' | 'partial';
    readonly appliedOps: number;
    readonly remainingOps: number;
    readonly reasons: readonly string[];
}
export declare const splitPlan: (plan: DataPlanePlan, maxOps: number) => DataPlanePlan;
/** One governed reconciliation pass. `transactionId` comes from the privileged mutation boundary. */
export declare const reconcileOnce: (desired: readonly DataPlaneRule[], backend: DataPlaneBackend, verifier: VerificationPort, owner: string, transactionId: string, options?: ReconcileOptions) => Promise<ReconcilePass>;
//# sourceMappingURL=reconciliation.d.ts.map