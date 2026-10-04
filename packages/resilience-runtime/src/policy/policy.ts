import type {
  ActionPlan,
  CandidateAction,
  PolicyEvaluation,
  RuntimeContext,
  CompiledIntent,
  PolicySnapshot,
} from '../domain/types.js';
import type { IntentConflict } from '../intent/arbitration.js';
import {
  arbitrateIntents,
  enforceAutonomy,
  InMemoryIntentStore,
  type IntentStore,
  type PolicyConflict,
} from '../intent/arbitration.js';
import { PolicyRegistry, type PolicyDomain } from './registry.js';

export class RuntimePolicyArbitrator {
  constructor(
    private readonly intentStore: IntentStore = new InMemoryIntentStore(),
    private readonly policyRegistry: PolicyRegistry = new PolicyRegistry(),
  ) {}

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
      ...new Set([
        ...(p.capabilityRequirements[action.intent] ?? []),
        ...action.requiredCapabilities,
      ]),
    ].sort();
    const missing = required.filter((c) => !context.capabilitySnapshot.capabilities.includes(c));
    if (missing.length) reasons.push(`missing capabilities: ${missing.join(',')}`);
    return { allowed: reasons.length === 0, reasons, requiredCapabilities: required };
  }

  /** Resolves intent conflicts for the current context. */
  async resolveIntentConflicts(
    context: RuntimeContext,
  ): Promise<{
    readonly ordered: readonly CompiledIntent[];
    readonly conflicts: readonly IntentConflict[];
  }> {
    const activeIntents = await this.intentStore.getActive();
    // Prefer compiledIntents (plural) which already includes compiledIntent, avoid duplication
    const contextIntents =
      context.compiledIntents ?? (context.compiledIntent ? [context.compiledIntent] : []);
    const allIntents = [...activeIntents, ...contextIntents];
    const arbitration = arbitrateIntents(allIntents, new Date());
    // Persist arbitration conflicts wherever the runtime persists intents, so
    // the conflict journal is durable rather than event-only.
    if (arbitration.conflicts.length > 0) {
      await this.intentStore.recordConflicts?.(arbitration.conflicts);
    }
    return arbitration;
  }

  /** Resolves policy conflicts between two snapshots. */
  resolvePolicyConflicts(
    policyA: PolicySnapshot,
    policyB: PolicySnapshot,
    strategy: 'union' | 'intersection' | 'hierarchical' = 'hierarchical',
  ): { readonly merged: PolicySnapshot; readonly conflicts: readonly PolicyConflict[] } {
    // PolicyRegistry is the canonical conflict resolver. Map the requested
    // merge strategy onto an existing domain so snapshot resolution does not
    // maintain a second merge implementation.
    const domain: PolicyDomain =
      strategy === 'union' ? 'dns' : strategy === 'intersection' ? 'failover' : 'global';
    const resolution = this.policyRegistry.resolveConflict(policyA.policy, policyB.policy, domain);
    return {
      merged: Object.freeze({ ...policyA, policy: resolution.merged }),
      conflicts: Object.freeze(
        resolution.conflicts.map((reason) => ({ policyA, policyB, reason, resolution: strategy })),
      ),
    };
  }

  /** Enforces autonomy at the mutation boundary. */
  enforceIntentAutonomy(
    intent: CompiledIntent,
    actionClass: 'read' | 'advise' | 'safe_mutate' | 'autonomous' | 'high_risk',
  ): void {
    enforceAutonomy(intent, actionClass);
  }
}
