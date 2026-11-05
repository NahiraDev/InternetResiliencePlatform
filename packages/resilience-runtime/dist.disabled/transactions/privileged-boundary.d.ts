/**
 * The single privileged mutation boundary for issue #278 (issue #272 Section G).
 *
 * Canonical phase order, enforced and not merely documented:
 *
 *   prepare -> snapshot -> validate -> policy -> security -> safety
 *           -> apply -> verify -> commit
 *
 * Failure path:
 *
 *   rollback -> verifyRollback -> recover
 *
 * Every gate is fail-closed: if policy, security, capability authorization or
 * safety cannot be satisfied, the transaction does not reach `apply`. A failure
 * after `apply` triggers compensation (rollback) which is itself verified, and
 * then recovery.
 *
 * Cancellation, timeout, idempotency, concurrent-mutation protection and partial
 * failure handling are properties of this machine, not of callers.
 */
import type { ActionExecution, ActionPlan, MutationSnapshot, RuntimeContext } from '../domain/types.js';
import type { ActionExecutor, EventSink } from '../ports/ports.js';
import { SafetyRollbackRecoveryKernel } from '../safety/safety-kernel.js';
import { RuntimeActionValidator } from '../validation/validation.js';
import { RuntimePolicyArbitrator } from '../policy/policy.js';
import type { RuntimeAdapterRegistry } from '../adapter-registry.js';
import { type ActorIdentity, type AuthorizationDecision, TrustBoundaryAuthorizationError, TrustBoundaryAuthorizer, type AiContribution } from '../security/trust-boundaries.js';
export declare const TRANSACTION_PHASES: readonly ["prepare", "snapshot", "validate", "policy", "security", "safety", "apply", "verify", "commit"];
export type TransactionPhase = (typeof TRANSACTION_PHASES)[number];
export declare const RECOVERY_PHASES: readonly ["rollback", "verifyRollback", "recover"];
export type RecoveryPhase = (typeof RECOVERY_PHASES)[number];
export declare class ConcurrentMutationError extends Error {
    readonly mutationId: string;
    readonly holderId: string;
    readonly code = "CONCURRENT_MUTATION";
    constructor(mutationId: string, holderId: string);
}
export interface PhaseRecord {
    readonly phase: TransactionPhase | RecoveryPhase;
    readonly status: 'passed' | 'blocked' | 'failed' | 'skipped';
    readonly reasons: readonly string[];
    readonly at: string;
    readonly durationMs?: number;
}
export interface PolicyGateInput {
    readonly allowed: boolean;
    readonly reasons: readonly string[];
    readonly requiredCapabilities: readonly string[];
}
export interface SecurityGateInput {
    readonly authorization: AuthorizationDecision;
    readonly reasons: readonly string[];
}
export interface SafetyGateInput {
    readonly safe: boolean;
    readonly reasons: readonly string[];
    readonly safetyCeiling?: number;
}
export interface VerificationResult {
    readonly verified: boolean;
    readonly reasons: readonly string[];
}
export interface CompensationResult {
    readonly compensated: boolean;
    readonly reasons: readonly string[];
    readonly snapshot?: MutationSnapshot;
}
export interface RecoveryResult {
    readonly recovered: boolean;
    readonly reasons: readonly string[];
    readonly strategy?: string;
}
/** Ports the privileged boundary depends on. All are required, never optional. */
export interface PrivilegedBoundaryPorts {
    readonly executor: ActionExecutor;
    readonly events: EventSink;
    /** Captures pre-mutation state for compensation. */
    readonly snapshot: (plan: ActionPlan, context: RuntimeContext) => Promise<MutationSnapshot>;
    /** Evaluates policy for the plan. Fail-closed by contract. */
    readonly policy: (plan: ActionPlan, context: RuntimeContext) => Promise<PolicyGateInput>;
    /** Verifies the mutation actually took effect. */
    readonly verify: (plan: ActionPlan, context: RuntimeContext, snapshot: MutationSnapshot) => Promise<VerificationResult>;
    /** Compensates a partially applied mutation. */
    readonly compensate: (plan: ActionPlan, context: RuntimeContext, snapshot: MutationSnapshot) => Promise<CompensationResult>;
    /** Confirms compensation actually restored prior state. */
    readonly verifyRollback: (plan: ActionPlan, context: RuntimeContext, snapshot: MutationSnapshot) => Promise<VerificationResult>;
    /** Last-resort recovery when compensation is insufficient. */
    readonly recover: (plan: ActionPlan, context: RuntimeContext, snapshot: MutationSnapshot, transactionId: string) => Promise<RecoveryResult>;
}
export interface PrivilegedBoundaryOptions {
    readonly authorizer?: TrustBoundaryAuthorizer;
    readonly safety: (plan: ActionPlan, context: RuntimeContext) => Promise<SafetyGateInput> | SafetyGateInput;
    /** Monotonic mutation epoch; advancing it invalidates in-flight mutations. */
    readonly epoch?: number;
    readonly mutationTimeoutMs?: number;
    readonly nowMs?: () => number;
}
export interface MutationRequest {
    readonly plan: ActionPlan;
    readonly context: RuntimeContext;
    readonly actor: ActorIdentity;
    readonly mutationId: string;
    readonly idempotencyKey: string;
    readonly resourceId: string;
    readonly resourceVersion?: string;
    /** Caller-supplied transaction identity for cross-boundary traceability. */
    readonly transactionId?: string;
    /** Epoch the decision was computed against; a stale epoch is rejected. */
    readonly epoch?: number;
    readonly ai?: AiContribution;
}
export interface TransactionOutcome {
    readonly transactionId: string;
    readonly phaseReached: TransactionPhase | RecoveryPhase | 'none';
    readonly status: 'committed' | 'failed' | 'recovered' | 'blocked' | 'cancelled' | 'timed-out';
    readonly execution?: ActionExecution;
    readonly snapshot?: MutationSnapshot;
    readonly phases: readonly PhaseRecord[];
    readonly reasons: readonly string[];
    readonly recovery?: RecoveryResult;
    readonly partialFailure: boolean;
}
/**
 * The one place a privileged network mutation may happen.
 *
 * There is no other code path: the executor port is private to this class, so a
 * caller cannot obtain it and bypass the gates.
 */
export declare class PrivilegedMutationBoundary {
    private readonly ports;
    private readonly authorizer;
    private readonly options;
    /** Bound action id per idempotency key, so a rebind can be refused. */
    private readonly completed;
    private readonly inFlight;
    private readonly held;
    private epoch;
    private counter;
    constructor(ports: PrivilegedBoundaryPorts, options: PrivilegedBoundaryOptions);
    /** Advances the mutation epoch, invalidating every in-flight mutation. */
    advanceEpoch(): number;
    currentEpoch(): number;
    heldMutations(): readonly string[];
    /**
     * Runs a mutation through the canonical phase machine.
     *
     * Never throws for gate rejection: a blocked phase is a recorded outcome, so
     * callers cannot accidentally treat a denial as success.
     */
    mutate(request: MutationRequest): Promise<TransactionOutcome>;
    private blocked;
    private record;
    private runMachine;
    /**
     * Compensation path: rollback -> verifyRollback -> recover.
     * Each step is recorded, and recovery runs whenever compensation is
     * insufficient or unverified.
     */
    private failurePath;
    private gateOutcome;
    private cancelledOutcome;
    private timedOutOutcome;
    private staleOutcome;
    private concurrentOutcome;
}
/**
 * Factory function for creating PrivilegedMutationBoundary with the canonical
 * ports wired to existing runtime components. This is the only authorized
 * construction path for the boundary outside of tests.
 */
export declare function createPrivilegedMutationBoundary(ports: {
    readonly executor: ActionExecutor;
    readonly events: EventSink;
    readonly safetyKernel: SafetyRollbackRecoveryKernel;
    readonly validator: RuntimeActionValidator;
    readonly adapters: RuntimeAdapterRegistry;
    readonly policyArbitrator?: RuntimePolicyArbitrator;
}): PrivilegedMutationBoundary;
export { TrustBoundaryAuthorizationError };
//# sourceMappingURL=privileged-boundary.d.ts.map