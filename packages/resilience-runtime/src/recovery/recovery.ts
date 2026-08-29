import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
import type { ActionPlan, RecoveryPlan, RuntimeContext } from '../domain/types.js';
import { RuntimeAdapterRegistry, createDefaultRuntimeAdapterRegistry } from '../adapter-registry.js';

export class FailoverRecoveryProvider {
  constructor(
    private readonly adapters: RuntimeAdapterRegistry = createDefaultRuntimeAdapterRegistry(),
  ) {}

  async recover(plan: ActionPlan, reason: string, context: RuntimeContext): Promise<RecoveryPlan> {
    // Security-triggered recovery must fail closed rather than attempting a mutation.
    if (reason.toLowerCase().includes('security')) {
      return deepFreeze({
        id: nextId('recovery'),
        schemaVersion: 1,
        createdAt: nowIso(),
        correlationId: context.correlationId,
        source: '@irp/failover-adapter',
        metadata: { delegated: false, attempted: false },
        delegatedTo: 'failover',
        status: 'failed',
        reason: `${reason}; security recovery is fail-closed`,
      });
    }

    // Recovery is a subsystem concern. Do not require the adapter that executed
    // the failed action to also implement rollback; delegate to the failover
    // recovery adapter instead.
    const actionAdapter = this.adapters.findForAction(
      plan.selectedAction.intent,
      plan.requiredCapabilities,
    );
    const recoveryAdapter =
      actionAdapter?.descriptor.recoverySupport && actionAdapter.rollback
        ? actionAdapter
        : this.adapters.findForAction('recovery', []);
    const rollbackSupported = Boolean(recoveryAdapter?.descriptor.recoverySupport && recoveryAdapter.rollback);

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
        reason: `${reason}; no executable failover rollback adapter is available`,
      });
    }

    try {
      const rollback = await recoveryAdapter!.rollback!(plan, context);
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
          adapterId: recoveryAdapter!.descriptor.adapterId,
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
