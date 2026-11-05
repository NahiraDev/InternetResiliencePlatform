/**
 * Trust boundaries and capability-based least privilege for issue #278
 * (issue #272 Section G, tasks 1, 2 and 3).
 *
 * One privileged mutation boundary. Every actor is classified, and only actors
 * inside the canonical runtime's own trust domain may request a privileged
 * mutation. Plugins, remote nodes, external clients and AI are explicitly
 * outside it.
 *
 * AI is advisory-only: it may propose a ranked action, but it can never satisfy
 * a capability requirement, authorise itself, or reach `apply` on its own.
 */
import { deepFreeze } from '../domain/ids.js';
export const TRUST_BOUNDARIES = [
    'canonical-runtime',
    'platform-adapter',
    'plugin',
    'remote-node',
    'external-client',
    'ai',
];
export const TRUST_RANK = Object.freeze({
    'canonical-runtime': 100,
    'platform-adapter': 60,
    plugin: 30,
    'remote-node': 20,
    'external-client': 10,
    ai: 5,
});
/**
 * AI is advisory-only for every boundary. This is the single source of truth
 * consulted by the capability authorizer and the phase machine.
 */
export const isAdvisoryOnlyBoundary = (boundary) => boundary === 'ai';
/**
 * Capability rules for privileged network mutation. A capability is bound to the
 * weakest boundary allowed to hold it, so a plugin can never be handed a
 * capability that only a platform adapter should have.
 */
export const DEFAULT_CAPABILITY_RULES = Object.freeze([
    Object.freeze({
        capability: 'observe.read',
        minimumBoundary: 'external-client',
        description: 'Read observations and runtime state.',
    }),
    Object.freeze({
        capability: 'plan.propose',
        minimumBoundary: 'external-client',
        description: 'Propose candidate actions.',
    }),
    Object.freeze({
        capability: 'intent.compile',
        minimumBoundary: 'plugin',
        description: 'Compile intents from advisory input.',
    }),
    Object.freeze({
        capability: 'knowledge.contribute',
        minimumBoundary: 'plugin',
        description: 'Contribute scoped advisory knowledge.',
    }),
    Object.freeze({
        capability: 'probe.remote',
        minimumBoundary: 'remote-node',
        description: 'Submit signed remote probe evidence.',
    }),
    // The capability names below are the ones the canonical decision provider and the platform
    // adapters actually request (`route.write`, `dns.write`, `connectivity.failover`,
    // `tunnel.write`, `network.observe`). They were missing from this table, and because an unknown
    // capability is denied, a live mutation planned by the real decision path could never be
    // authorized. Privileged ones stay bound to the canonical runtime boundary: plugins, remote
    // nodes, external clients and AI can never hold them.
    Object.freeze({
        capability: 'network.observe',
        minimumBoundary: 'canonical-runtime',
        description: 'Observe host network state without changing it.',
    }),
    Object.freeze({
        capability: 'route.write',
        minimumBoundary: 'canonical-runtime',
        description: 'Add, replace or delete host routes.',
    }),
    Object.freeze({
        capability: 'dns.write',
        minimumBoundary: 'canonical-runtime',
        description: 'Change the host resolver configuration.',
    }),
    Object.freeze({
        capability: 'connectivity.failover',
        minimumBoundary: 'canonical-runtime',
        description: 'Switch the active connectivity source.',
    }),
    Object.freeze({
        capability: 'tunnel.write',
        minimumBoundary: 'canonical-runtime',
        description: 'Create, switch or tear down a tunnel.',
    }),
    Object.freeze({
        capability: 'network.mutate',
        minimumBoundary: 'canonical-runtime',
        description: 'Apply a privileged network mutation.',
    }),
    Object.freeze({
        capability: 'fabric.mutate',
        minimumBoundary: 'platform-adapter',
        description: 'Mutate programmable fabric resources.',
    }),
    Object.freeze({
        capability: 'tunnel.mutate',
        minimumBoundary: 'platform-adapter',
        description: 'Create, switch or tear down tunnels.',
    }),
]);
const ruleFor = (capability, rules = DEFAULT_CAPABILITY_RULES) => rules.find((rule) => rule.capability === capability);
export class TrustBoundaryAuthorizationError extends Error {
    actorId;
    missing;
    reason;
    code = 'CAPABILITY_DENIED';
    constructor(actorId, missing, reason) {
        super(`actor '${actorId}' denied: ${reason} (missing: ${missing.join(', ') || 'none'})`);
        this.actorId = actorId;
        this.missing = missing;
        this.reason = reason;
        this.name = 'TrustBoundaryAuthorizationError';
    }
}
/**
 * Least-privilege capability authorization across trust boundaries.
 *
 * Named `TrustBoundaryAuthorizer`, not `CapabilityAuthorizer`: `@irp/kernel`
 * already exports a `CapabilityAuthorizer` that answers a different question
 * (does a DI principal hold a capability). This one additionally ranks trust
 * boundaries, enforces advisory-only actors and returns explainable denials.
 *
 * Order of evaluation is fixed and fail-closed: unverified actors, advisory-only
 * boundaries, unknown capabilities and insufficient trust rank are all denied
 * before any grant is considered. Deny always beats allow.
 */
export class TrustBoundaryAuthorizer {
    rules;
    constructor(rules = DEFAULT_CAPABILITY_RULES) {
        this.rules = rules;
    }
    authorize(actor, required) {
        const missing = [];
        if (!actor.verified) {
            return { allowed: false, reason: 'unverified-actor', satisfied: [], missing: [...required] };
        }
        if (isAdvisoryOnlyBoundary(actor.boundary)) {
            return {
                allowed: false,
                reason: 'advisory-only-boundary',
                satisfied: [],
                missing: [...required],
            };
        }
        const denied = new Set(actor.deniedCapabilities ?? []);
        const granted = new Set(actor.grantedCapabilities);
        const satisfied = [];
        for (const capability of required) {
            if (denied.has(capability)) {
                return {
                    allowed: false,
                    reason: 'capability-denied',
                    satisfied,
                    missing: [...missing, capability],
                };
            }
            // Fail closed on an unknown capability: an unrecognised privilege request
            // is a rejection, never an implicit allow.
            const rule = ruleFor(capability, this.rules);
            if (!rule) {
                return {
                    allowed: false,
                    reason: 'capability-not-granted',
                    satisfied,
                    missing: [...missing, capability],
                };
            }
            if (TRUST_RANK[actor.boundary] < TRUST_RANK[rule.minimumBoundary]) {
                return {
                    allowed: false,
                    reason: 'insufficient-trust-rank',
                    satisfied,
                    missing: [...missing, capability],
                };
            }
            if (!granted.has(capability)) {
                missing.push(capability);
                continue;
            }
            satisfied.push(capability);
        }
        if (missing.length > 0) {
            return { allowed: false, reason: 'capability-not-granted', satisfied, missing };
        }
        return { allowed: true, satisfied: Object.freeze(satisfied), missing: Object.freeze([]) };
    }
    authorizeOrThrow(actor, required) {
        const decision = this.authorize(actor, required);
        if (!decision.allowed) {
            throw new TrustBoundaryAuthorizationError(actor.actorId, decision.missing, decision.reason ?? 'capability-not-granted');
        }
        return decision.satisfied;
    }
    /**
     * Capabilities an actor could ever hold within its own boundary. Used to show
     * the maximum privilege available to an actor rather than what it holds now.
     */
    ceilingFor(actor) {
        const denied = new Set(actor.deniedCapabilities ?? []);
        return Object.freeze(this.rules
            .filter((rule) => TRUST_RANK[actor.boundary] >= TRUST_RANK[rule.minimumBoundary] &&
            !denied.has(rule.capability))
            .map((rule) => rule.capability));
    }
}
/**
 * Rebuilds an action from the canonical plan, discarding AI-supplied authority
 * fields. The returned action is the only form allowed to advance.
 */
export const enforceAiAdvisoryBoundary = (input) => deepFreeze({
    // Intent and capabilities come from the canonical plan, never from AI.
    intent: input.canonicalIntent,
    requiredCapabilities: Object.freeze([...input.canonicalCapabilities]),
    rationale: input.ai?.rationale ?? 'no-ai-contribution',
    aiAdvisoryOnly: true,
});
//# sourceMappingURL=trust-boundaries.js.map