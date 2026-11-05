import type { ActionExecution, ActionPlan, RecoveryPlan, RuntimeContext } from '../domain/types.js';
import type { RecoveryProvider } from '../ports/ports.js';
export interface SafetyKernelOptions {
    readonly maxBlastRadius?: number;
    readonly checkpoint?: (plan: ActionPlan, context: RuntimeContext) => Promise<unknown>;
    readonly rollback?: (plan: ActionPlan, context: RuntimeContext, checkpoint: unknown) => Promise<ActionExecution>;
}
export interface SafetyAssessment {
    readonly allowed: boolean;
    readonly reasons: readonly string[];
    readonly blastRadius: number;
}
export declare class SafetyViolationError extends Error {
    readonly assessment: SafetyAssessment;
    readonly code = "SAFETY_VIOLATION";
    constructor(assessment: SafetyAssessment);
}
/**
 * The canonical safety port consumed by `PrivilegedMutationBoundary`.
 *
 * This class deliberately has no execution method. It assesses, checkpoints and
 * recovers, but it never applies a mutation itself: applying requires the
 * privileged boundary, so a caller cannot reach an executor through the safety
 * port and bypass the policy/security/safety/verify/commit phase machine.
 */
export declare class SafetyRollbackRecoveryKernel {
    private readonly events;
    private readonly recovery;
    private readonly maxBlastRadius;
    constructor(events: {
        emit(event: string, payload: Readonly<Record<string, unknown>>): Promise<void>;
    }, recovery: RecoveryProvider, options?: SafetyKernelOptions);
    private readonly checkpoint;
    private readonly rollback;
    assess(plan: ActionPlan, context: RuntimeContext): SafetyAssessment;
    createCheckpoint(plan: ActionPlan, context: RuntimeContext): Promise<unknown>;
    rollbackCheckpoint(plan: ActionPlan, context: RuntimeContext, checkpoint: unknown): Promise<ActionExecution | undefined>;
    recover(plan: ActionPlan, reason: string, context: RuntimeContext, transactionId?: string): Promise<RecoveryPlan>;
}
//# sourceMappingURL=safety-kernel.d.ts.map