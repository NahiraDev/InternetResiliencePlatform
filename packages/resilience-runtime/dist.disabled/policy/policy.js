import { arbitrateIntents, enforceAutonomy, InMemoryIntentStore, } from '../intent/arbitration.js';
import { PolicyRegistry } from './registry.js';
export class RuntimePolicyArbitrator {
    intentStore;
    policyRegistry;
    constructor(intentStore = new InMemoryIntentStore(), policyRegistry = new PolicyRegistry()) {
        this.intentStore = intentStore;
        this.policyRegistry = policyRegistry;
    }
    async evaluate(target, context) {
        const action = 'selectedAction' in target ? target.selectedAction : target;
        const p = context.policySnapshot.policy;
        const reasons = [];
        if (p.failClosed && (!context.securityContext.trusted || !context.capabilitySnapshot.trusted))
            reasons.push('security context or capability snapshot is untrusted');
        if (p.simulationOnly && context.mode === 'live')
            reasons.push('policy is simulation-only');
        if (!p.allowedActions.includes(action.intent))
            reasons.push(`action ${action.intent} is not allowed`);
        if (p.deniedActions.includes(action.intent))
            reasons.push(`action ${action.intent} is denied`);
        if (action.confidence < p.confidenceThreshold)
            reasons.push('candidate confidence is below threshold');
        const required = [
            ...new Set([
                ...(p.capabilityRequirements[action.intent] ?? []),
                ...action.requiredCapabilities,
            ]),
        ].sort();
        const missing = required.filter((c) => !context.capabilitySnapshot.capabilities.includes(c));
        if (missing.length)
            reasons.push(`missing capabilities: ${missing.join(',')}`);
        return { allowed: reasons.length === 0, reasons, requiredCapabilities: required };
    }
    /** Resolves intent conflicts for the current context. */
    async resolveIntentConflicts(context) {
        let activeIntents = [];
        let storeDegraded = false;
        try {
            activeIntents = await this.intentStore.getActive();
        }
        catch {
            // An optional remote store must never disable local autonomy. The
            // in-context intents are still arbitrated; the store is simply unavailable.
            storeDegraded = true;
        }
        // Prefer compiledIntents (plural) which already includes compiledIntent, avoid duplication
        const contextIntents = context.compiledIntents ?? (context.compiledIntent ? [context.compiledIntent] : []);
        const allIntents = [...activeIntents, ...contextIntents];
        const arbitration = arbitrateIntents(allIntents, new Date());
        // Persist arbitration conflicts wherever the runtime persists intents, so
        // the conflict journal is durable rather than event-only.
        if (arbitration.conflicts.length > 0 && this.intentStore.recordConflicts !== undefined) {
            try {
                await this.intentStore.recordConflicts(arbitration.conflicts);
            }
            catch {
                storeDegraded = true;
            }
        }
        return { ...arbitration, persistenceDegraded: storeDegraded };
    }
    /** Resolves policy conflicts between two snapshots. */
    resolvePolicyConflicts(policyA, policyB, strategy = 'hierarchical') {
        // PolicyRegistry is the canonical conflict resolver. Map the requested
        // merge strategy onto an existing domain so snapshot resolution does not
        // maintain a second merge implementation.
        const domain = strategy === 'union' ? 'dns' : strategy === 'intersection' ? 'failover' : 'global';
        const resolution = this.policyRegistry.resolveConflict(policyA.policy, policyB.policy, domain);
        return {
            merged: Object.freeze({ ...policyA, policy: resolution.merged }),
            conflicts: Object.freeze(resolution.conflicts.map((reason) => ({ policyA, policyB, reason, resolution: strategy }))),
        };
    }
    /** Enforces autonomy at the mutation boundary. */
    enforceIntentAutonomy(intent, actionClass) {
        enforceAutonomy(intent, actionClass);
    }
}
//# sourceMappingURL=policy.js.map