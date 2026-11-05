import type { ActionExecution, ActionPlan, ActionVerification, RecoveryPlan, RuntimeContext } from './domain/types.js';
export type Phase40ScenarioName = 'healthy' | 'dns-degradation' | 'provider-recovery' | 'destination-specific';
export type Phase40Stage = 'observe' | 'measure' | 'detect' | 'diagnose' | 'decide' | 'policy' | 'apply' | 'verify' | 'recover';
export interface Phase40ScenarioStep {
    readonly name: Phase40ScenarioName;
    readonly stages: readonly Phase40Stage[];
    readonly decisionIds: readonly string[];
    readonly outcomes: readonly string[];
    readonly incidents: readonly string[];
    readonly recoveryStatus?: string;
    readonly verificationStatus?: string;
}
export interface Phase40ValidationReport {
    readonly schemaVersion: 1;
    readonly status: 'passed' | 'failed';
    readonly deterministic: true;
    readonly scenarios: readonly Phase40ScenarioStep[];
    readonly acceptance: Readonly<Record<string, boolean>>;
    readonly failedCriteria: readonly string[];
}
export interface Phase40FaultPlan {
    readonly execution: 'success' | 'failed';
    readonly verification: ActionVerification['status'];
    readonly recovery: RecoveryPlan['status'];
}
export interface Phase40ExecutionHarness {
    readonly execute: (plan: ActionPlan, context: RuntimeContext, faults: Phase40FaultPlan) => Promise<ActionExecution>;
    readonly verify: (plan: ActionPlan, execution: ActionExecution, context: RuntimeContext, faults: Phase40FaultPlan) => Promise<ActionVerification>;
    readonly recover: (plan: ActionPlan, reason: string, context: RuntimeContext, faults: Phase40FaultPlan) => Promise<RecoveryPlan>;
}
export declare const runPhase40Validation: () => Promise<Phase40ValidationReport>;
//# sourceMappingURL=e2e-validation.d.ts.map