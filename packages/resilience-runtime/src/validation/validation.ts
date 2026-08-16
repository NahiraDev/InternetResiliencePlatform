import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
import type { ActionPlan, ActionValidation, RuntimeContext } from '../domain/types.js';
import { RuntimePolicyArbitrator } from '../policy/policy.js';
export class RuntimeActionValidator {
  private active = new Set<string>();
  constructor(private readonly policy = new RuntimePolicyArbitrator()) {}
  lock(key: string) {
    if (this.active.has(key)) return false;
    this.active.add(key);
    return true;
  }
  release(key: string) {
    this.active.delete(key);
  }
  async validate(plan: ActionPlan, context: RuntimeContext): Promise<ActionValidation> {
    const reasons: string[] = [];
    const policy = await this.policy.evaluate(plan, context);
    reasons.push(...policy.reasons);
    if (context.cancelled) reasons.push('context is cancelled');
    if (
      plan.selectedAction.intent !== 'noop' &&
      context.mode === 'safe' &&
      !context.securityContext.trusted
    )
      reasons.push('safe mode requires trusted authorization for mutation');
    if (plan.alternatives.length + 1 > context.configuration.maxActionsPerCycle)
      reasons.push('action budget exceeded');
    if (context.observationSnapshot?.stale)
      reasons.push('stale telemetry cannot validate mutating plan');
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
      policy,
    });
  }
}
