import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
import type { ActionExecution, ActionPlan, RuntimeContext } from '../domain/types.js';
import { RuntimeAdapterRegistry, createAdapterExecution } from '../adapter-registry.js';

export class CoordinatedActionExecutor {
  private readonly inFlight = new Map<string, Promise<ActionExecution>>();

  constructor(private readonly adapters: RuntimeAdapterRegistry) {}

  async execute(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution> {
    const key = String(plan.metadata['idempotencyKey'] ?? plan.id);
    const existing = this.inFlight.get(key);
    if (existing) {
      return deepFreeze({
        ...(await existing),
        id: nextId('execution'),
        status: 'duplicate',
      });
    }

    const run = this.doExecute(plan, context);
    this.inFlight.set(key, run);
    try {
      return await run;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async doExecute(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution> {
    const simulated = context.mode !== 'live' || context.policySnapshot.policy.simulationOnly;

    if (plan.selectedAction.intent === 'noop') {
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
        afterState: { noop: true },
      });
    }

    const adapter = this.adapters.findForAction(
      plan.selectedAction.intent,
      plan.requiredCapabilities,
    );

    if (!adapter) {
      return deepFreeze({
        id: nextId('execution'),
        schemaVersion: 1,
        createdAt: nowIso(),
        correlationId: context.correlationId,
        source: 'resilience-runtime',
        metadata: {},
        status: 'failed',
        simulated,
        actionId: plan.selectedAction.id,
        beforeState: { mode: context.mode },
        afterState: { applied: false },
        error: `No runtime adapter supports action ${plan.selectedAction.intent} with required capabilities`,
      });
    }

    if (context.mode === 'live' && !context.policySnapshot.policy.simulationOnly) {
      if (!adapter.descriptor.supportsLive) {
        return deepFreeze({
          id: nextId('execution'),
          schemaVersion: 1,
          createdAt: nowIso(),
          correlationId: context.correlationId,
          source: 'resilience-runtime',
          metadata: { adapterId: adapter.descriptor.adapterId },
          status: 'failed',
          simulated: false,
          actionId: plan.selectedAction.id,
          beforeState: { mode: context.mode },
          afterState: { applied: false },
          error: `Live execution is not supported by adapter ${adapter.descriptor.adapterId}`,
        });
      }

      return adapter.execute(plan, context);
    }

    if (!adapter.descriptor.supportsSimulation && context.mode !== 'live') {
      return deepFreeze({
        id: nextId('execution'),
        schemaVersion: 1,
        createdAt: nowIso(),
        correlationId: context.correlationId,
        source: 'resilience-runtime',
        metadata: { adapterId: adapter.descriptor.adapterId },
        status: 'failed',
        simulated: true,
        actionId: plan.selectedAction.id,
        beforeState: { mode: context.mode },
        afterState: { applied: false },
        error: `Simulation is not supported by adapter ${adapter.descriptor.adapterId}`,
      });
    }

    return createAdapterExecution(plan, context, true, 'skipped');
  }
}
