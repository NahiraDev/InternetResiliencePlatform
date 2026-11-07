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
export declare class IdempotencyConflictError extends Error {
    readonly idempotencyKey: string;
    readonly existingActionId: string;
    readonly requestedActionId: string;
    readonly code = "IDEMPOTENCY_CONFLICT";
    constructor(idempotencyKey: string, existingActionId: string, requestedActionId: string);
}
export declare class ActionTransactionEngine {
    private readonly executor;
    private readonly events;
    private readonly completed;
    private readonly inFlight;
    constructor(executor: ActionExecutor, events: EventSink);
    execute(plan: ActionPlan, context: RuntimeContext, requestedIdempotencyKey?: string): Promise<ActionExecution>;
    list(): readonly ActionTransaction[];
    private runTransaction;
}
//# sourceMappingURL=action-transaction.d.ts.map