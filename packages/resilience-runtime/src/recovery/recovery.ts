import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
import type { ActionPlan, RecoveryPlan, RuntimeContext } from '../domain/types.js';
import { RuntimeAdapterRegistry, createDefaultRuntimeAdapterRegistry } from '../adapter-registry.js';

export class FailoverRecoveryProvider {
  constructor(
    private readonly adapters: RuntimeAdapterRegistry = createDefaultRuntimeAdapterRegistry(),
  ) {}

  async recover(plan: ActionPlan, reason: string, context: RuntimeContext): Promise<RecoveryPlan> {
    const adapter = this.adapters.findForAction(
      plan.selectedAction.intent,
      plan.requiredCapabilities,
    );
    const rollbackSupported = Boolean(adapter?.descriptor.recoverySupport && adapter.rollback);

    if (!rollbackSupported) {
      return deepFreeze({
        id: nextId('recovery'),
        schemaVersion: 1,
        createdAt: nowIso(),
        correlationId: context.correlationId,
        source: '@irp/failover-adapter',
        metadata: { delegated: false, attempted: false },
        delegatedTo: 'failover',
        status: 'failed',
        reason: `${reason}; no executable rollback adapter is available`,
      });
    }

    try {
      const rollback = await adapter!.rollback!(plan, context);
      const status = rollback.status === 'success' ? 'success' : 'failed';
      return deepFreeze({
        id: nextId('recovery'),
        schemaVersion: 1,
        createdAt: nowIso(),
        correlationId: context.correlationId,
        source: '@irp/failover-adapter',
        metadata: {
          delegated: true,
          attempted: true,
          adapterId: adapter!.descriptor.adapterId,
          rollbackExecutionId: rollback.id,
          rollbackStatus: rollback.status,
        },
        delegatedTo: 'failover',
        status,
        reason,
      });
    } catch (error) {
      return deepFreeze({
        id: nextId('recovery'),
        schemaVersion: 1,
        createdAt: nowIso(),
        correlationId: context.correlationId,
        source: '@irp/failover-adapter',
        metadata: { delegated: true, attempted: true },
        delegatedTo: 'failover',
        status: 'failed',
        reason: `${reason}; rollback failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
