import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
export class IdempotencyConflictError extends Error {
    idempotencyKey;
    existingActionId;
    requestedActionId;
    code = 'IDEMPOTENCY_CONFLICT';
    constructor(idempotencyKey, existingActionId, requestedActionId) {
        super(`Idempotency key '${idempotencyKey}' is already bound to action '${existingActionId}', not '${requestedActionId}'`);
        this.idempotencyKey = idempotencyKey;
        this.existingActionId = existingActionId;
        this.requestedActionId = requestedActionId;
        this.name = 'IdempotencyConflictError';
    }
}
const MAX_TRANSACTIONS = 1_000;
export class ActionTransactionEngine {
    executor;
    events;
    completed = new Map();
    inFlight = new Map();
    constructor(executor, events) {
        this.executor = executor;
        this.events = events;
    }
    async execute(plan, context, requestedIdempotencyKey) {
        const idempotencyKey = requestedIdempotencyKey ?? String(plan.metadata['idempotencyKey'] ?? plan.selectedAction.id);
        const existing = this.completed.get(idempotencyKey);
        if (existing) {
            if (existing.actionId !== plan.selectedAction.id) {
                throw new IdempotencyConflictError(idempotencyKey, existing.actionId, plan.selectedAction.id);
            }
            await this.events.emit('runtime.transaction.duplicate', {
                correlationId: context.correlationId,
                transactionId: existing.id,
                idempotencyKey,
                actionId: existing.actionId,
            });
            return deepFreeze({
                ...existing.execution,
                id: nextId('execution'),
                status: 'duplicate',
            });
        }
        const active = this.inFlight.get(idempotencyKey);
        if (active) {
            const execution = await active;
            if (execution.actionId !== plan.selectedAction.id) {
                throw new IdempotencyConflictError(idempotencyKey, execution.actionId, plan.selectedAction.id);
            }
            await this.events.emit('runtime.transaction.duplicate', {
                correlationId: context.correlationId,
                transactionId: execution.id,
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
        const created = deepFreeze({
            id: transactionId,
            schemaVersion: 1,
            createdAt: nowIso(),
            correlationId: context.correlationId,
            idempotencyKey,
            actionId: plan.selectedAction.id,
            status: 'created',
        });
        const transactionalPlan = deepFreeze({
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
            const record = deepFreeze({
                ...created,
                status: execution.status === 'success' || execution.status === 'skipped' ? 'committed' : 'failed',
                execution,
            });
            this.completed.set(idempotencyKey, record);
            while (this.completed.size > MAX_TRANSACTIONS) {
                this.completed.delete(this.completed.keys().next().value);
            }
            return execution;
        }
        finally {
            this.inFlight.delete(idempotencyKey);
        }
    }
    list() {
        return [...this.completed.values()];
    }
    async runTransaction(transaction, plan, context) {
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
            const event = execution.status === 'success' || execution.status === 'skipped'
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
        }
        catch (error) {
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
//# sourceMappingURL=action-transaction.js.map