import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
import type { ActionPlan, RecoveryPlan, RuntimeContext } from '../domain/types.js';
export class FailoverRecoveryProvider {
  async recover(_plan: ActionPlan, reason: string, context: RuntimeContext): Promise<RecoveryPlan> {
    return deepFreeze({
      id: nextId('recovery'),
      schemaVersion: 1,
      createdAt: nowIso(),
      correlationId: context.correlationId,
      source: '@irp/failover-adapter',
      metadata: { delegated: true },
      delegatedTo: 'failover',
      status: reason.includes('security') ? 'failed' : 'success',
      reason,
    });
  }
}
