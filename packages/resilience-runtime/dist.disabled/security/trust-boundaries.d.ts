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
export declare const TRUST_BOUNDARIES: readonly ["canonical-runtime", "platform-adapter", "plugin", "remote-node", "external-client", "ai"];
export type TrustBoundary = (typeof TRUST_BOUNDARIES)[number];
export declare const TRUST_RANK: Readonly<Record<TrustBoundary, number>>;
/**
 * AI is advisory-only for every boundary. This is the single source of truth
 * consulted by the capability authorizer and the phase machine.
 */
export declare const isAdvisoryOnlyBoundary: (boundary: TrustBoundary) => boolean;
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
export type DenialReason = 'unverified-actor' | 'untrusted-boundary' | 'advisory-only-boundary' | 'capability-not-granted' | 'capability-denied' | 'insufficient-trust-rank';
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
export declare const DEFAULT_CAPABILITY_RULES: readonly CapabilityRule[];
export declare class TrustBoundaryAuthorizationError extends Error {
    readonly actorId: string;
    readonly missing: readonly string[];
    readonly reason: DenialReason;
    readonly code = "CAPABILITY_DENIED";
    constructor(actorId: string, missing: readonly string[], reason: DenialReason);
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
export declare class TrustBoundaryAuthorizer {
    private readonly rules;
    constructor(rules?: readonly CapabilityRule[]);
    authorize(actor: ActorIdentity, required: readonly string[]): AuthorizationDecision;
    authorizeOrThrow(actor: ActorIdentity, required: readonly string[]): readonly string[];
    /**
     * Capabilities an actor could ever hold within its own boundary. Used to show
     * the maximum privilege available to an actor rather than what it holds now.
     */
    ceilingFor(actor: ActorIdentity): readonly string[];
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
export declare const enforceAiAdvisoryBoundary: (input: {
    readonly canonicalIntent: string;
    readonly canonicalCapabilities: readonly string[];
    readonly ai?: AiContribution;
}) => SanitisedAction;
//# sourceMappingURL=trust-boundaries.d.ts.map