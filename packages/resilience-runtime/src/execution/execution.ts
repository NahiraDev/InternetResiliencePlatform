import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
import type { ActionExecution, ActionPlan, RuntimeContext } from '../domain/types.js';
export class CoordinatedActionExecutor {
  private inFlight = new Map<string, Promise<ActionExecution>>();
  async execute(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution> {
    const key = String(plan.metadata['idempotencyKey'] ?? plan.id);
    if (this.inFlight.has(key))
      return deepFreeze({
        ...(await this.inFlight.get(key)!),
        id: nextId('execution'),
        status: 'duplicate',
      });
    const run = this.doExecute(plan, context);
    this.inFlight.set(key, run);
    try {
      return await run;
    } finally {
      this.inFlight.delete(key);
    }
  }
  private async doExecute(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution> {
    if (
      context.mode !== 'live' ||
      context.policySnapshot.policy.simulationOnly ||
      plan.selectedAction.intent === 'noop'
    )
      return deepFreeze({
        id: nextId('execution'),
        schemaVersion: 1,
        createdAt: nowIso(),
        correlationId: context.correlationId,
        source: 'resilience-runtime',
        metadata: {},
        status: 'skipped',
        simulated: true,
        actionId: plan.selectedAction.id,
        beforeState: { mode: context.mode },
        afterState: { predicted: plan.expectedPostconditions },
      });
    return deepFreeze({
      id: nextId('execution'),
      schemaVersion: 1,
      createdAt: nowIso(),
      correlationId: context.correlationId,
      source: 'approved-capability-adapter',
      metadata: {},
      status: 'success',
      simulated: false,
      actionId: plan.selectedAction.id,
      beforeState: { captured: true },
      afterState: { delegated: true },
    });
  }
}
