import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
import type { ActionPlan, ActionValidation, RuntimeContext } from '../domain/types.js';
import { RuntimeAdapterRegistry, createDefaultRuntimeAdapterRegistry } from '../adapter-registry.js';

export class RuntimeActionValidator {
  private readonly active = new Set<string>();

  constructor(
    private readonly policy = undefined,
    private readonly adapters: RuntimeAdapterRegistry = createDefaultRuntimeAdapterRegistry(),
  ) {}

  lock(key: string): boolean {
    if (this.active.has(key)) return false;
    this.active.add(key);
    return true;
  }

  release(key: string): void {
    this.active.delete(key);
  }

  async validate(plan: ActionPlan, context: RuntimeContext): Promise<ActionValidation> {
    const reasons: string[] = [];
    const policyResult = this.policy
      ? await (this.policy as { evaluate: (plan: ActionPlan, context: RuntimeContext) => Promise<{ reasons: string[] }> }).evaluate(plan, context)
      : { reasons: [] as string[] };
    reasons.push(...policyResult.reasons);

    if (context.cancelled) reasons.push('context is cancelled');
    if (plan.selectedAction.intent !== 'noop' && context.mode === 'safe' && !context.securityContext.trusted)
      reasons.push('safe mode requires trusted authorization for mutation');

    // alternatives are not executable actions; only the selected action consumes the action budget.
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

    const conflictKey = plan.dependencies.join('|') || plan.selectedAction.intent;
    if (this.active.has(conflictKey)) reasons.push('conflicting operation is active');

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
