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
] as const;

export type TrustBoundary = (typeof TRUST_BOUNDARIES)[number];

export const TRUST_RANK: Readonly<Record<TrustBoundary, number>> = Object.freeze({
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
export const isAdvisoryOnlyBoundary = (boundary: TrustBoundary): boolean => boundary === 'ai';

export interface ActorIdentity {
  readonly actorId: string;
  readonly boundary: TrustBoundary;
  /** Capabilities the actor may ever hold, granted by the runtime. */
  readonly grantedCapabilities: readonly string[];
  /** Explicitly denied capabilities. Deny always wins. */
  readonly deniedCapabilities?: readonly string[];
  /** True when the actor's credentials were verified by the runtime. */
  readonly verified: boolean;
  /** Optional trust chain describing how the actor was admitted. */
  readonly trustChain?: readonly string[];
}

export type DenialReason =
  | 'unverified-actor'
  | 'untrusted-boundary'
  | 'advisory-only-boundary'
  | 'capability-not-granted'
  | 'capability-denied'
  | 'insufficient-trust-rank';

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly reason?: DenialReason;
  /** Capabilities actually required and granted, for audit. */
  readonly satisfied: readonly string[];
  readonly missing: readonly string[];
}

export interface CapabilityRule {
  readonly capability: string;
  /** Minimum boundary that may hold this capability. */
  readonly minimumBoundary: TrustBoundary;
  readonly description?: string;
}

/**
 * Capability rules for privileged network mutation. A capability is bound to the
 * weakest boundary allowed to hold it, so a plugin can never be handed a
 * capability that only a platform adapter should have.
 */
export const DEFAULT_CAPABILITY_RULES: readonly CapabilityRule[] = Object.freeze([
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

export const ruleFor = (
  capability: string,
  rules: readonly CapabilityRule[] = DEFAULT_CAPABILITY_RULES,
): CapabilityRule | undefined => rules.find((rule) => rule.capability === capability);

export class TrustBoundaryAuthorizationError extends Error {
  readonly code = 'CAPABILITY_DENIED';

  constructor(
    readonly actorId: string,
    readonly missing: readonly string[],
    readonly reason: DenialReason,
  ) {
    super(`actor '${actorId}' denied: ${reason} (missing: ${missing.join(', ') || 'none'})`);
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
  constructor(private readonly rules: readonly CapabilityRule[] = DEFAULT_CAPABILITY_RULES) {}

  authorize(actor: ActorIdentity, required: readonly string[]): AuthorizationDecision {
    const missing: string[] = [];

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
    const satisfied: string[] = [];

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

  authorizeOrThrow(actor: ActorIdentity, required: readonly string[]): readonly string[] {
    const decision = this.authorize(actor, required);
    if (!decision.allowed) {
      throw new TrustBoundaryAuthorizationError(
        actor.actorId,
        decision.missing,
        decision.reason ?? 'capability-not-granted',
      );
    }
    return decision.satisfied;
  }

  /**
   * Capabilities an actor could ever hold within its own boundary. Used to show
   * the maximum privilege available to an actor rather than what it holds now.
   */
  ceilingFor(actor: ActorIdentity): readonly string[] {
    const denied = new Set(actor.deniedCapabilities ?? []);
    return Object.freeze(
      this.rules
        .filter(
          (rule) =>
            TRUST_RANK[actor.boundary] >= TRUST_RANK[rule.minimumBoundary] &&
            !denied.has(rule.capability),
        )
        .map((rule) => rule.capability),
    );
  }
}

/**
 * Strips any AI influence from an action before it reaches a privileged phase.
 * AI may contribute advisory weight and rationale; it may not supply the
 * action's intent authority or its required capabilities.
 */
export interface AiContribution {
  readonly rationale?: string;
  readonly recommendedIntent?: string;
  /** Weightings AI proposed; advisory only. */
  readonly objectiveWeights?: Readonly<Record<string, number>>;
}

export interface SanitisedAction {
  readonly intent: string;
  readonly requiredCapabilities: readonly string[];
  readonly rationale: string;
  readonly aiAdvisoryOnly: true;
}

/**
 * Rebuilds an action from the canonical plan, discarding AI-supplied authority
 * fields. The returned action is the only form allowed to advance.
 */
export const enforceAiAdvisoryBoundary = (input: {
  readonly canonicalIntent: string;
  readonly canonicalCapabilities: readonly string[];
  readonly ai?: AiContribution;
}): SanitisedAction =>
  deepFreeze({
    // Intent and capabilities come from the canonical plan, never from AI.
    intent: input.canonicalIntent,
    requiredCapabilities: Object.freeze([...input.canonicalCapabilities]),
    rationale: input.ai?.rationale ?? 'no-ai-contribution',
    aiAdvisoryOnly: true,
  });
