import { deepFreeze, nextId } from '../domain/ids.js';
import type { ActionExecution, ActionPlan, RecoveryPlan, RuntimeContext } from '../domain/types.js';
import type { ActionTransactionEngine } from '../transactions/action-transaction.js';
import type { RecoveryProvider } from '../ports/ports.js';

export interface SafetyKernelOptions {
  readonly maxBlastRadius?: number;
  readonly checkpoint?: (plan: ActionPlan, context: RuntimeContext) => Promise<unknown>;
  readonly rollback?: (
    plan: ActionPlan,
    context: RuntimeContext,
    checkpoint: unknown,
  ) => Promise<ActionExecution>;
}

export interface SafetyAssessment {
  readonly allowed: boolean;
  readonly reasons: readonly string[];
  readonly blastRadius: number;
}

export interface SafetyExecutionResult {
  readonly execution: ActionExecution;
  readonly checkpointCreated: boolean;
  readonly rollbackAttempted: boolean;
  readonly rollbackExecution?: ActionExecution;
}

export class SafetyViolationError extends Error {
  readonly code = 'SAFETY_VIOLATION';

  constructor(readonly assessment: SafetyAssessment) {
    super(`Action blocked by safety kernel: ${assessment.reasons.join('; ')}`);
    this.name = 'SafetyViolationError';
  }
}

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const metadataNumber = (plan: ActionPlan, key: string): number | undefined => {
  const value = plan.metadata[key];
  return finiteNumber(value) ? value : undefined;
};

export class SafetyRollbackRecoveryKernel {
  private readonly maxBlastRadius: number;

  constructor(
    private readonly transactions: ActionTransactionEngine,
    private readonly events: { emit(event: string, payload: Readonly<Record<string, unknown>>): Promise<void> },
    private readonly recovery: RecoveryProvider,
    options: SafetyKernelOptions = {},
  ) {
    this.maxBlastRadius = options.maxBlastRadius ?? 0.75;
    if (!finiteNumber(this.maxBlastRadius) || this.maxBlastRadius < 0 || this.maxBlastRadius > 1) {
      throw new RangeError('maxBlastRadius must be a finite number between 0 and 1');
    }
    this.checkpoint = options.checkpoint;
    this.rollback = options.rollback;
  }

  private readonly checkpoint: SafetyKernelOptions['checkpoint'];
  private readonly rollback: SafetyKernelOptions['rollback'];

  assess(plan: ActionPlan, context: RuntimeContext): SafetyAssessment {
    const reasons: string[] = [];
    const action = plan.selectedAction;
    const mutating = action.intent !== 'noop';

    if (!context.cancelled) {
      const deadline = Date.parse(context.deadline);
      if (!Number.isFinite(deadline)) reasons.push('context deadline is invalid');
      else if (Date.now() >= deadline) reasons.push('context deadline has expired');
    } else {
      reasons.push('context is cancelled');
    }

    if (!plan.policyResult.allowed) reasons.push('plan policy result is not allowed');
    if (!context.securityContext.trusted && mutating && context.mode !== 'simulation') {
      reasons.push('trusted authorization is required for mutation');
    }
    if (mutating && context.mode === 'live' && context.policySnapshot.policy.simulationOnly) {
      reasons.push('policy is simulation-only');
    }
    if (!finiteNumber(plan.risk) || plan.risk < 0 || plan.risk > 1) {
      reasons.push('plan risk is invalid');
    }

    const explicitBlastRadius = metadataNumber(plan, 'blastRadius');
    const blastRadius = explicitBlastRadius ?? plan.risk;
    if (!finiteNumber(blastRadius) || blastRadius < 0 || blastRadius > 1) {
      reasons.push('blast radius is invalid');
    } else if (blastRadius > this.maxBlastRadius) {
      reasons.push(`blast radius ${blastRadius} exceeds limit ${this.maxBlastRadius}`);
    }

    if (mutating && action.requiredCapabilities.some((cap) => !context.capabilitySnapshot.capabilities.includes(cap))) {
      reasons.push('required capability is not present in the trusted capability snapshot');
    }

    return deepFreeze({ allowed: reasons.length === 0, reasons, blastRadius });
  }

  async execute(
    plan: ActionPlan,
    context: RuntimeContext,
    requestedIdempotencyKey?: string,
  ): Promise<SafetyExecutionResult> {
    const assessment = this.assess(plan, context);
    const base = {
      correlationId: context.correlationId,
      actionId: plan.selectedAction.id,
      blastRadius: assessment.blastRadius,
    };

    await this.events.emit('runtime.safety.assessed', { ...base, allowed: assessment.allowed, reasons: assessment.reasons });
    if (!assessment.allowed) {
      await this.events.emit('runtime.safety.blocked', { ...base, reasons: assessment.reasons });
      throw new SafetyViolationError(assessment);
    }

    let checkpoint: unknown;
    if (this.checkpoint && plan.selectedAction.intent !== 'noop') {
      checkpoint = await this.checkpoint(plan, context);
      await this.events.emit('runtime.safety.checkpoint.created', {
        ...base,
        checkpointId: nextId('checkpoint'),
      });
    }

    const execution = await this.transactions.execute(plan, context, requestedIdempotencyKey);
    const rollbackEligible = execution.status === 'failed' && checkpoint !== undefined && this.rollback !== undefined;

    if (!rollbackEligible) {
      await this.events.emit('runtime.safety.completed', {
        ...base,
        executionStatus: execution.status,
        rollbackAttempted: false,
      });
      return deepFreeze({ execution, checkpointCreated: checkpoint !== undefined, rollbackAttempted: false });
    }

    await this.events.emit('runtime.safety.rollback.started', { ...base });
    try {
      const rollbackExecution = await this.rollback!(plan, context, checkpoint);
      const success = rollbackExecution.status === 'success' || rollbackExecution.status === 'skipped';
      await this.events.emit(success ? 'runtime.safety.rollback.completed' : 'runtime.safety.rollback.failed', {
        ...base,
        rollbackStatus: rollbackExecution.status,
      });
      return deepFreeze({
        execution,
        checkpointCreated: true,
        rollbackAttempted: true,
        rollbackExecution,
      });
    } catch (error) {
      await this.events.emit('runtime.safety.rollback.failed', {
        ...base,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async recover(
    plan: ActionPlan,
    reason: string,
    context: RuntimeContext,
  ): Promise<RecoveryPlan> {
    await this.events.emit('runtime.safety.recovery.started', {
      correlationId: context.correlationId,
      actionId: plan.selectedAction.id,
      reason,
    });
    const result = await this.recovery.recover(plan, reason, context);
    await this.events.emit('runtime.safety.recovery.completed', {
      correlationId: context.correlationId,
      actionId: plan.selectedAction.id,
      reason,
      status: result.status,
    });
    return result;
  }
}
