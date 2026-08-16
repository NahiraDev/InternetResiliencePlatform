import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
import type {
  ActionExecution,
  ActionPlan,
  ActionVerification,
  RuntimeContext,
} from '../domain/types.js';
export class RuntimeActionVerifier {
  async verify(
    plan: ActionPlan,
    execution: ActionExecution,
    context: RuntimeContext,
  ): Promise<ActionVerification> {
    const skipped = execution.status === 'skipped' || plan.selectedAction.intent === 'noop';
    const failed = execution.status === 'failed' ? plan.expectedPostconditions : [];
    return deepFreeze({
      id: nextId('verification'),
      schemaVersion: 1,
      createdAt: nowIso(),
      correlationId: context.correlationId,
      source: 'resilience-runtime',
      metadata: {},
      status: skipped ? 'skipped' : failed.length ? 'failed' : 'success',
      verifiedPostconditions: skipped
        ? []
        : plan.expectedPostconditions.filter((p) => !failed.includes(p)),
      failedPostconditions: failed,
    });
  }
}
