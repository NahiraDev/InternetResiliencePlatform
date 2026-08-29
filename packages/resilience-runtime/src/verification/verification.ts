import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
import type {
  ActionExecution,
  ActionPlan,
  ActionVerification,
  RuntimeContext,
} from '../domain/types.js';
import {
  RuntimeAdapterRegistry,
  createDefaultRuntimeAdapterRegistry,
} from '../adapter-registry.js';

export class RuntimeActionVerifier {
  constructor(
    private readonly adapters: RuntimeAdapterRegistry = createDefaultRuntimeAdapterRegistry(),
  ) {}

  async verify(
    plan: ActionPlan,
    execution: ActionExecution,
    context: RuntimeContext,
  ): Promise<ActionVerification> {
    const skipped = execution.status === 'skipped' || plan.selectedAction.intent === 'noop';
    if (skipped) {
      return deepFreeze({
        id: nextId('verification'),
        schemaVersion: 1,
        createdAt: nowIso(),
        correlationId: context.correlationId,
        source: 'resilience-runtime',
        metadata: {},
        status: 'skipped',
        verifiedPostconditions: [],
        failedPostconditions: [],
      });
    }

    if (execution.status !== 'success') {
      return deepFreeze({
        id: nextId('verification'),
        schemaVersion: 1,
        createdAt: nowIso(),
        correlationId: context.correlationId,
        source: 'resilience-runtime',
        metadata: {},
        status: 'failed',
        verifiedPostconditions: [],
        failedPostconditions: plan.expectedPostconditions,
      });
    }

    const adapter = this.adapters.findForAction(
      plan.selectedAction.intent,
      plan.requiredCapabilities,
    );

    if (!adapter || !adapter.descriptor.verificationSupport) {
      return deepFreeze({
        id: nextId('verification'),
        schemaVersion: 1,
        createdAt: nowIso(),
        correlationId: context.correlationId,
        source: 'resilience-runtime',
        metadata: {},
        status: 'failed',
        verifiedPostconditions: [],
        failedPostconditions: plan.expectedPostconditions,
      });
    }

    if (context.mode === 'live' && !adapter.descriptor.supportsLive) {
      return deepFreeze({
        id: nextId('verification'),
        schemaVersion: 1,
        createdAt: nowIso(),
        correlationId: context.correlationId,
        source: 'resilience-runtime',
        metadata: { adapterId: adapter.descriptor.adapterId },
        status: 'failed',
        verifiedPostconditions: [],
        failedPostconditions: plan.expectedPostconditions,
      });
    }

    return adapter.verify(plan, execution, context);
  }
}
