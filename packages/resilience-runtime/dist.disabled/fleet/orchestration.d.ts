/**
 * Phase 118 — Multi-Device Orchestration.
 *
 * Wave-based orchestration of an operation across devices with explicit
 * dependencies, bounded concurrency, per-device timeouts, abort and a failure
 * policy. The operation itself is submitted through an injected port to each
 * device's own canonical runtime; the orchestrator never mutates a device
 * directly and only targets devices the caller declares operational.
 */
export type DeviceStepStatus = 'succeeded' | 'failed' | 'skipped' | 'timed-out' | 'aborted';
export interface OrchestrationStep {
    readonly deviceId: string;
    readonly dependsOn?: readonly string[];
}
export interface OrchestrationPlan {
    readonly planId: string;
    readonly operation: string;
    readonly steps: readonly OrchestrationStep[];
    readonly maxConcurrency: number;
    readonly perDeviceTimeoutMs: number;
    readonly onFailure: 'halt' | 'continue';
}
export interface DeviceOperationPort {
    /** Submits the operation to one device; resolves when that device's runtime reports the outcome. */
    run(deviceId: string, operation: string, signal: AbortSignal): Promise<{
        ok: boolean;
        detail?: string;
    }>;
}
export interface StepResult {
    readonly deviceId: string;
    readonly status: DeviceStepStatus;
    readonly wave: number;
    readonly detail?: string;
}
export interface OrchestrationResult {
    readonly planId: string;
    readonly outcome: 'completed' | 'partial' | 'halted' | 'aborted';
    readonly results: readonly StepResult[];
    readonly waves: readonly (readonly string[])[];
}
export declare class OrchestrationPlanError extends Error {
    constructor(message: string);
}
/** Topologically layers steps into waves; throws on unknown dependencies, duplicates and cycles. */
export declare const planWaves: (steps: readonly OrchestrationStep[]) => readonly (readonly string[])[];
export declare const runOrchestration: (plan: OrchestrationPlan, port: DeviceOperationPort, options?: {
    readonly signal?: AbortSignal;
    readonly isOperational?: (deviceId: string) => boolean;
}) => Promise<OrchestrationResult>;
//# sourceMappingURL=orchestration.d.ts.map