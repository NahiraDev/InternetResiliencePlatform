import type {
  ActionPlan,
  CandidateAction,
  PolicyEvaluation,
  RuntimeContext,
} from '../domain/types.js';
export class RuntimePolicyArbitrator {
  async evaluate(
    target: ActionPlan | CandidateAction,
    context: RuntimeContext,
  ): Promise<PolicyEvaluation> {
    const action = 'selectedAction' in target ? target.selectedAction : target;
    const p = context.policySnapshot.policy;
    const reasons: string[] = [];
    if (p.failClosed && (!context.securityContext.trusted || !context.capabilitySnapshot.trusted))
      reasons.push('security context or capability snapshot is untrusted');
    if (p.simulationOnly && context.mode === 'live') reasons.push('policy is simulation-only');
    if (!p.allowedActions.includes(action.intent))
      reasons.push(`action ${action.intent} is not allowed`);
    if (p.deniedActions.includes(action.intent)) reasons.push(`action ${action.intent} is denied`);
    if (action.confidence < p.confidenceThreshold)
      reasons.push('candidate confidence is below threshold');
    const required = [
      ...(p.capabilityRequirements[action.intent] ?? []),
      ...action.requiredCapabilities,
    ].sort();
    const missing = required.filter((c) => !context.capabilitySnapshot.capabilities.includes(c));
    if (missing.length) reasons.push(`missing capabilities: ${missing.join(',')}`);
    return { allowed: reasons.length === 0, reasons, requiredCapabilities: required };
  }
}
