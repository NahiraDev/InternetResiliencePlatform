import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
import type { ActionPlan, ActionValidation, RuntimeContext } from '../domain/types.js';
import { RuntimePolicyArbitrator } from '../policy/policy.js';
import { RuntimeAdapterRegistry, createDefaultRuntimeAdapterRegistry } from '../adapter-registry.js';

export class RuntimeActionValidator {
  constructor(
    private readonly policy = new RuntimePolicyArbitrator(),
    private readonly adapters: RuntimeAdapterRegistry = createDefaultRuntimeAdapterRegistry(),
  ) {}

  async validate(plan: ActionPlan, context: RuntimeContext, activeOperation = false): Promise<ActionValidation> {
    const reasons: string[] = [];
    const policyResult = await this.policy.evaluate(plan, context);
    reasons.push(...policyResult.reasons);

    if (context.cancelled) reasons.push('context is cancelled');
    if (plan.selectedAction.intent !== 'noop' && context.mode === 'safe' && !context.securityContext.trusted)
      reasons.push('safe mode requires trusted authorization for mutation');
    if (plan.selectedAction.intent !== 'noop' && context.configuration.maxActionsPerCycle < 1)
      reasons.push('action budget exhausted');
    if (context.observationSnapshot?.stale)
      reasons.push('stale telemetry cannot validate mutating plan');

    if (plan.selectedAction.intent !== 'noop') {
      const adapter = this.adapters.findForAction(plan.selectedAction.intent, plan.requiredCapabilities);
      if (!adapter) {
        reasons.push('no adapter satisfies the selected action and required capabilities');
      } else {
        if (context.mode === 'live' && !adapter.descriptor.supportsLive)
          reasons.push(`adapter ${adapter.descriptor.adapterId} does not support live execution`);
        if (context.mode !== 'live' && !adapter.descriptor.supportsSimulation)
          reasons.push(`adapter ${adapter.descriptor.adapterId} does not support simulation`);
        if (!adapter.descriptor.verificationSupport)
          reasons.push(`adapter ${adapter.descriptor.adapterId} does not support verification`);
      }
    }

    if (activeOperation) reasons.push('conflicting operation is active');
    return deepFreeze({
      id: nextId('validation'),
      schemaVersion: 1,
      createdAt: nowIso(),
      correlationId: context.correlationId,
      source: 'resilience-runtime',
      metadata: {},
      valid: reasons.length === 0,
      reasons,
      policy: policyResult,
    });
  }
}
