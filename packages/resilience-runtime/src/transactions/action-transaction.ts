import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
import type { ActionExecution, ActionPlan, RuntimeContext } from '../domain/types.js';
import type { ActionExecutor, EventSink } from '../ports/ports.js';

export type ActionTransactionStatus = 'created' | 'executing' | 'committed' | 'failed';

export interface ActionTransaction {
  readonly id: string;
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly actionId: string;
  readonly status: ActionTransactionStatus;
  readonly execution?: ActionExecution;
  readonly error?: string;
}

export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_CONFLICT';

  constructor(
    readonly idempotencyKey: string,
    readonly existingActionId: string,
    readonly requestedActionId: string,
  ) {
    super(
      `Idempotency key '${idempotencyKey}' is already bound to action '${existingActionId}', not '${requestedActionId}'`,
    );
    this.name = 'IdempotencyConflictError';
  }
}

const MAX_TRANSACTIONS = 1_000;

export class ActionTransactionEngine {
  private readonly completed = new Map<string, ActionTransaction>();
  private readonly inFlight = new Map<string, Promise<ActionExecution>>();

  constructor(
    private readonly executor: ActionExecutor,
    private readonly events: EventSink,
  ) {}

  async execute(
    plan: ActionPlan,
    context: RuntimeContext,
    requestedIdempotencyKey?: string,
  ): Promise<ActionExecution> {
    const idempotencyKey =
      requestedIdempotencyKey ??
      String(plan.metadata['idempotencyKey'] ?? plan.selectedAction.id);

    const existing = this.completed.get(idempotencyKey);
    if (existing) {
      if (existing.actionId !== plan.selectedAction.id) {
        throw new IdempotencyConflictError(
          idempotencyKey,
          existing.actionId,
          plan.selectedAction.id,
        );
      }

      await this.events.emit('runtime.transaction.duplicate', {
        correlationId: context.correlationId,
        transactionId: existing.id,
        idempotencyKey,
        actionId: existing.actionId,
      });

      return deepFreeze({
        ...existing.execution!,
        id: nextId('execution'),
        status: 'duplicate',
      });
    }

    const active = this.inFlight.get(idempotencyKey);
    if (active) {
      const execution = await active;
      if (execution.actionId !== plan.selectedAction.id) {
        throw new IdempotencyConflictError(
          idempotencyKey,
          execution.actionId,
          plan.selectedAction.id,
        );
      }

      await this.events.emit('runtime.transaction.duplicate', {
        correlationId: context.correlationId,
        idempotencyKey,
        actionId: execution.actionId,
        concurrent: true,
      });

      return deepFreeze({
        ...execution,
        id: nextId('execution'),
        status: 'duplicate',
      });
    }

    const transactionId = nextId('transaction');
    const created: ActionTransaction = deepFreeze({
      id: transactionId,
      schemaVersion: 1,
      createdAt: nowIso(),
      correlationId: context.correlationId,
      idempotencyKey,
      actionId: plan.selectedAction.id,
      status: 'created',
    });

    const transactionalPlan: ActionPlan = deepFreeze({
      ...plan,
      metadata: {
        ...plan.metadata,
        idempotencyKey,
        transactionId,
      },
    });

    // Register before awaiting the event sink. This closes the concurrency
    // window between the initial lookup and the in-flight registration.
    const run = this.runTransaction(created, transactionalPlan, context);
    this.inFlight.set(idempotencyKey, run);

    try {
      const execution = await run;
      const record: ActionTransaction = deepFreeze({
        ...created,
        status:
          execution.status === 'success' || execution.status === 'skipped'
            ? 'committed'
            : 'failed',
        execution,
      });
      this.completed.set(idempotencyKey, record);
      while (this.completed.size > MAX_TRANSACTIONS) {
        this.completed.delete(this.completed.keys().next().value as string);
      }
      return execution;
    } finally {
      this.inFlight.delete(idempotencyKey);
    }
  }

  list(): readonly ActionTransaction[] {
    return [...this.completed.values()];
  }

  private async runTransaction(
    transaction: ActionTransaction,
    plan: ActionPlan,
    context: RuntimeContext,
  ): Promise<ActionExecution> {
    await this.events.emit('runtime.transaction.created', {
      correlationId: context.correlationId,
      transactionId: transaction.id,
      idempotencyKey: transaction.idempotencyKey,
      actionId: transaction.actionId,
    });

    await this.events.emit('runtime.transaction.executing', {
      correlationId: context.correlationId,
      transactionId: transaction.id,
      idempotencyKey: transaction.idempotencyKey,
      actionId: transaction.actionId,
    });

    try {
      const execution = await this.executor.execute(plan, context);
      const event =
        execution.status === 'success' || execution.status === 'skipped'
          ? 'runtime.transaction.committed'
          : 'runtime.transaction.failed';

      await this.events.emit(event, {
        correlationId: context.correlationId,
        transactionId: transaction.id,
        idempotencyKey: transaction.idempotencyKey,
        actionId: transaction.actionId,
        executionStatus: execution.status,
      });

      return execution;
    } catch (error) {
      await this.events.emit('runtime.transaction.failed', {
        correlationId: context.correlationId,
        transactionId: transaction.id,
        idempotencyKey: transaction.idempotencyKey,
        actionId: transaction.actionId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      throw error;
    }
  }
}
