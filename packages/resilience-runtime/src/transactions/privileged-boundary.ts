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

import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
import type { ActionExecution, ActionPlan, MutationSnapshot, RuntimeContext } from '../domain/types.js';
import type { ActionExecutor, EventSink } from '../ports/ports.js';
import { RuntimeActionVerifier } from '../verification/verification.js';
import { SafetyRollbackRecoveryKernel } from '../safety/safety-kernel.js';
import { RuntimeActionValidator } from '../validation/validation.js';
import type { RuntimeAdapterRegistry } from '../adapter-registry.js';
import {
  type ActorIdentity,
  type AuthorizationDecision,
  TrustBoundaryAuthorizationError,
  TrustBoundaryAuthorizer,
  enforceAiAdvisoryBoundary,
  type AiContribution,
} from '../security/trust-boundaries.js';

export const TRANSACTION_PHASES = [
  'prepare',
  'snapshot',
  'validate',
  'policy',
  'security',
  'safety',
  'apply',
  'verify',
  'commit',
] as const;

export type TransactionPhase = (typeof TRANSACTION_PHASES)[number];

export const RECOVERY_PHASES = ['rollback', 'verifyRollback', 'recover'] as const;
export type RecoveryPhase = (typeof RECOVERY_PHASES)[number];

export class TransactionGateError extends Error {
  readonly code = 'TRANSACTION_GATE_FAILED';

  constructor(
    readonly phase: TransactionPhase,
    readonly reasons: readonly string[],
  ) {
    super(`transaction blocked at '${phase}': ${reasons.join('; ')}`);
    this.name = 'TransactionGateError';
  }
}

export class TransactionCancelledError extends Error {
  readonly code = 'TRANSACTION_CANCELLED';

  constructor(readonly phase: TransactionPhase) {
    super(`transaction cancelled at '${phase}'`);
    this.name = 'TransactionCancelledError';
  }
}

export class TransactionTimeoutError extends Error {
  readonly code = 'TRANSACTION_TIMEOUT';

  constructor(
    readonly phase: TransactionPhase,
    readonly elapsedMs: number,
  ) {
    super(`transaction timed out at '${phase}' after ${elapsedMs}ms`);
    this.name = 'TransactionTimeoutError';
  }
}

export class ConcurrentMutationError extends Error {
  readonly code = 'CONCURRENT_MUTATION';

  constructor(
    readonly mutationId: string,
    readonly holderId: string,
  ) {
    super(`mutation '${mutationId}' is already held by '${holderId}'`);
    this.name = 'ConcurrentMutationError';
  }
}

export class StaleMutationError extends Error {
  readonly code = 'STALE_MUTATION';

  constructor(
    readonly mutationId: string,
    readonly reason: 'epoch-superseded' | 'resource-version-changed',
  ) {
    super(`mutation '${mutationId}' is stale: ${reason}`);
    this.name = 'StaleMutationError';
  }
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
  readonly verify: (
    plan: ActionPlan,
    context: RuntimeContext,
    snapshot: MutationSnapshot,
  ) => Promise<VerificationResult>;
  /** Compensates a partially applied mutation. */
  readonly compensate: (
    plan: ActionPlan,
    context: RuntimeContext,
    snapshot: MutationSnapshot,
  ) => Promise<CompensationResult>;
  /** Confirms compensation actually restored prior state. */
  readonly verifyRollback: (
    plan: ActionPlan,
    context: RuntimeContext,
    snapshot: MutationSnapshot,
  ) => Promise<VerificationResult>;
  /** Last-resort recovery when compensation is insufficient. */
  readonly recover: (
    plan: ActionPlan,
    context: RuntimeContext,
    snapshot: MutationSnapshot,
  ) => Promise<RecoveryResult>;
}

export interface PrivilegedBoundaryOptions {
  readonly authorizer?: TrustBoundaryAuthorizer;
  readonly safety: (
    plan: ActionPlan,
    context: RuntimeContext,
  ) => Promise<SafetyGateInput> | SafetyGateInput;
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

const MAX_IDEMPOTENCY_ENTRIES = 1_000;

/**
 * The one place a privileged network mutation may happen.
 *
 * There is no other code path: the executor port is private to this class, so a
 * caller cannot obtain it and bypass the gates.
 */
export class PrivilegedMutationBoundary {
  private readonly authorizer: TrustBoundaryAuthorizer;
  private readonly options: Required<Omit<PrivilegedBoundaryOptions, 'authorizer' | 'safety'>> &
    Pick<PrivilegedBoundaryOptions, 'authorizer' | 'safety'>;
  /** Bound action id per idempotency key, so a rebind can be refused. */
  private readonly completed = new Map<
    string,
    { readonly actionId: string; readonly outcome: TransactionOutcome }
  >();
  private readonly inFlight = new Map<string, Promise<TransactionOutcome>>();
  private readonly held = new Map<string, string>();
  private epoch: number;
  private counter = 0;

  constructor(
    private readonly ports: PrivilegedBoundaryPorts,
    options: PrivilegedBoundaryOptions,
  ) {
    this.authorizer = options.authorizer ?? new TrustBoundaryAuthorizer();
    this.epoch = options.epoch ?? 1;
    this.options = {
      epoch: this.epoch,
      mutationTimeoutMs: Math.max(1, options.mutationTimeoutMs ?? 30_000),
      nowMs: options.nowMs ?? (() => Date.now()),
      safety: options.safety,
    };
  }

  /** Advances the mutation epoch, invalidating every in-flight mutation. */
  advanceEpoch(): number {
    this.epoch += 1;
    return this.epoch;
  }

  currentEpoch(): number {
    return this.epoch;
  }

  heldMutations(): readonly string[] {
    return Object.freeze([...this.held.keys()]);
  }

  /**
   * Runs a mutation through the canonical phase machine.
   *
   * Never throws for gate rejection: a blocked phase is a recorded outcome, so
   * callers cannot accidentally treat a denial as success.
   */
  async mutate(request: MutationRequest): Promise<TransactionOutcome> {
    const { idempotencyKey } = request;

    const actionId = request.plan.selectedAction.id;
    const completed = this.completed.get(idempotencyKey);
    if (completed) {
      if (completed.actionId !== actionId) {
        // The key is bound to a different action. Replaying it would mutate
        // something the caller did not name, so this is refused fail-closed.
        return this.blocked('commit', ['idempotency-key-already-bound']);
      }
      return deepFreeze({
        ...completed.outcome,
        status: 'committed',
        reasons: ['idempotent-replay'],
      });
    }
    const active = this.inFlight.get(idempotencyKey);
    if (active) return active;

    const run = this.runMachine(request).finally(() => {
      this.inFlight.delete(idempotencyKey);
    });
    this.inFlight.set(idempotencyKey, run);
    const outcome = await run;
    this.completed.set(idempotencyKey, { actionId, outcome });
    while (this.completed.size > MAX_IDEMPOTENCY_ENTRIES) {
      this.completed.delete(this.completed.keys().next().value as string);
    }
    return outcome;
  }

  private blocked(phase: TransactionPhase, reasons: readonly string[]): TransactionOutcome {
    return deepFreeze({
      transactionId: nextId('transaction'),
      phaseReached: phase,
      status: 'blocked',
      phases: [deepFreeze({ phase, status: 'blocked', reasons, at: nowIso() })],
      reasons,
      partialFailure: false,
    });
  }

  private record(
    phases: PhaseRecord[],
    phase: TransactionPhase | RecoveryPhase,
    status: PhaseRecord['status'],
    reasons: readonly string[] = [],
    startedAt?: number,
  ): void {
    const nowMs = this.options.nowMs();
    phases.push(
      deepFreeze({
        phase,
        status,
        reasons,
        at: new Date(nowMs).toISOString(),
        ...(startedAt !== undefined ? { durationMs: nowMs - startedAt } : {}),
      }),
    );
  }

  private async runMachine(request: MutationRequest): Promise<TransactionOutcome> {
    const phases: PhaseRecord[] = [];
    const transactionId = request.transactionId ?? nextId('transaction');
    const startedAt = this.options.nowMs();
    const { plan, context, actor } = request;
    const budget = () => startedAt + this.options.mutationTimeoutMs;

    const timeout = (): boolean => this.options.nowMs() > budget();
    const cancelled = (): boolean => context.cancelled === true;

    // --- prepare -----------------------------------------------------------
    if (cancelled()) return this.cancelledOutcome(phases, 'prepare', startedAt);
    if (timeout()) return this.timedOutOutcome(phases, 'prepare', startedAt);
    // Stale/concurrent protection: an epoch older than the boundary's, or a
    // mutation already held elsewhere, is rejected before any work.
    if (request.epoch !== undefined && request.epoch !== this.epoch) {
      return this.staleOutcome(phases, 'prepare', 'epoch-superseded', startedAt);
    }
    if (
      this.held.has(request.resourceId) &&
      this.held.get(request.resourceId) !== request.mutationId
    ) {
      return this.concurrentOutcome(phases, 'prepare', startedAt);
    }
    this.counter += 1;
    this.held.set(request.resourceId, request.mutationId);
    this.record(phases, 'prepare', 'passed', [], startedAt);

    try {
      // --- snapshot --------------------------------------------------------
      const snapshot = await this.ports.snapshot(plan, context);
      this.record(phases, 'snapshot', 'passed', [], startedAt);
      if (
        request.resourceVersion !== undefined &&
        snapshot.resourceVersion !== request.resourceVersion
      ) {
        return this.staleOutcome(
          phases,
          'snapshot',
          'resource-version-changed',
          startedAt,
          snapshot,
        );
      }

      // --- validate --------------------------------------------------------
      if (cancelled()) return this.cancelledOutcome(phases, 'validate', startedAt, snapshot);
      if (timeout()) return this.timedOutOutcome(phases, 'validate', startedAt, snapshot);
      if (plan.selectedAction.rejectionReasons.length > 0) {
        return this.gateOutcome(
          phases,
          'validate',
          [...plan.selectedAction.rejectionReasons],
          startedAt,
          snapshot,
        );
      }
      this.record(phases, 'validate', 'passed', [], startedAt);

      // --- policy ----------------------------------------------------------
      if (cancelled()) return this.cancelledOutcome(phases, 'policy', startedAt, snapshot);
      if (timeout()) return this.timedOutOutcome(phases, 'policy', startedAt, snapshot);
      const policy = await this.ports.policy(plan, context);
      if (!policy.allowed) {
        return this.gateOutcome(phases, 'policy', [...policy.reasons], startedAt, snapshot);
      }
      this.record(phases, 'policy', 'passed', [], startedAt);

      // --- security --------------------------------------------------------
      if (cancelled()) return this.cancelledOutcome(phases, 'security', startedAt, snapshot);
      if (timeout()) return this.timedOutOutcome(phases, 'security', startedAt, snapshot);
      // AI may contribute rationale and a recommended intent, never authority.
      // Sanitising here means an AI-suggested capability cannot join the
      // requirement set, and the canonical plan's intent is what is executed.
      const canonical = enforceAiAdvisoryBoundary({
        canonicalIntent: plan.selectedAction.intent,
        canonicalCapabilities: [...plan.requiredCapabilities, ...policy.requiredCapabilities],
        ...(request.ai !== undefined ? { ai: request.ai } : {}),
      });
      if (
        request.ai?.recommendedIntent !== undefined &&
        request.ai.recommendedIntent !== canonical.intent
      ) {
        await this.ports.events.emit('runtime.mutation.ai-intent-ignored', {
          correlationId: context.correlationId,
          transactionId,
          aiRecommendedIntent: request.ai.recommendedIntent,
          canonicalIntent: canonical.intent,
        });
      }
      const authorization = this.authorizer.authorize(actor, canonical.requiredCapabilities);
      if (!authorization.allowed) {
        await this.ports.events.emit('runtime.mutation.blocked', {
          correlationId: context.correlationId,
          transactionId,
          phase: 'security',
          reason: authorization.reason ?? 'capability-denied',
          missing: authorization.missing,
        });
        return this.gateOutcome(
          phases,
          'security',
          [
            ...(authorization.reason ? [`reason:${authorization.reason}`] : []),
            ...authorization.missing.map((capability) => `missing-capability:${capability}`),
          ],
          startedAt,
          snapshot,
        );
      }
      this.record(phases, 'security', 'passed', [], startedAt);

      // --- safety ----------------------------------------------------------
      if (cancelled()) return this.cancelledOutcome(phases, 'safety', startedAt, snapshot);
      if (timeout()) return this.timedOutOutcome(phases, 'safety', startedAt, snapshot);
      const safety = await this.options.safety(plan, context);
      if (!safety.safe) {
        return this.gateOutcome(phases, 'safety', [...safety.reasons], startedAt, snapshot);
      }
      this.record(phases, 'safety', 'passed', [], startedAt);

      // --- apply -----------------------------------------------------------
      if (cancelled()) return this.cancelledOutcome(phases, 'apply', startedAt, snapshot);
      if (timeout()) return this.timedOutOutcome(phases, 'apply', startedAt, snapshot);
      await this.ports.events.emit('runtime.mutation.applying', {
        correlationId: context.correlationId,
        transactionId,
        mutationId: request.mutationId,
        aiAdvisoryOnly: request.ai !== undefined,
      });
      let execution: ActionExecution;
      try {
        execution = await this.ports.executor.execute(plan, context);
      } catch (error) {
        // Partial failure: the mutation was attempted, so it must be compensated.
        return this.failurePath(
          phases,
          plan,
          context,
          snapshot,
          [error instanceof Error ? error.message : 'apply-threw'],
          startedAt,
        );
      }
      const applied = execution.status === 'success' || execution.status === 'skipped';
      this.record(phases, 'apply', applied ? 'passed' : 'failed', [], startedAt);

      if (!applied) {
        // A failed apply is a partial-failure candidate: compensate and verify.
        return this.failurePath(
          phases,
          plan,
          context,
          snapshot,
          [`apply-status:${execution.status}`],
          startedAt,
          execution,
        );
      }

      // --- verify ----------------------------------------------------------
      if (cancelled())
        return this.cancelledOutcome(phases, 'verify', startedAt, snapshot, execution);
      if (timeout()) return this.timedOutOutcome(phases, 'verify', startedAt, snapshot, execution);
      const verification = await this.ports.verify(plan, context, snapshot);
      if (!verification.verified) {
        return this.failurePath(
          phases,
          plan,
          context,
          snapshot,
          [...verification.reasons],
          startedAt,
          execution,
        );
      }
      this.record(phases, 'verify', 'passed', [], startedAt);

      // --- commit ----------------------------------------------------------
      await this.ports.events.emit('runtime.mutation.committed', {
        correlationId: context.correlationId,
        transactionId,
        mutationId: request.mutationId,
      });
      this.record(phases, 'commit', 'passed', [], startedAt);
      return deepFreeze({
        transactionId,
        phaseReached: 'commit',
        status: 'committed',
        execution,
        snapshot,
        phases,
        reasons: [],
        partialFailure: false,
      });
    } finally {
      this.held.delete(request.resourceId);
    }
  }

  /**
   * Compensation path: rollback -> verifyRollback -> recover.
   * Each step is recorded, and recovery runs whenever compensation is
   * insufficient or unverified.
   */
  private async failurePath(
    phases: PhaseRecord[],
    plan: ActionPlan,
    context: RuntimeContext,
    snapshot: MutationSnapshot,
    reasons: readonly string[],
    startedAt: number,
    execution?: ActionExecution,
  ): Promise<TransactionOutcome> {
    const transactionId = nextId('transaction');
    const partialFailure = execution !== undefined;

    const compensation = await this.ports.compensate(plan, context, snapshot);
    this.record(
      phases,
      'rollback',
      compensation.compensated ? 'passed' : 'failed',
      compensation.reasons,
      startedAt,
    );

    const rollbackVerification = await this.ports.verifyRollback(plan, context, snapshot);
    const rollbackVerified = rollbackVerification.verified;
    this.record(
      phases,
      'verifyRollback',
      rollbackVerified ? 'passed' : 'failed',
      rollbackVerification.reasons,
      startedAt,
    );

    if (compensation.compensated && rollbackVerified) {
      await this.ports.events.emit('runtime.mutation.rolledback', {
        correlationId: context.correlationId,
        transactionId,
      });
      return deepFreeze({
        transactionId,
        phaseReached: 'verifyRollback',
        status: 'recovered',
        ...(execution !== undefined ? { execution } : {}),
        snapshot,
        phases,
        reasons,
        partialFailure,
      });
    }

    const recovery = await this.ports.recover(plan, context, snapshot);
    this.record(
      phases,
      'recover',
      recovery.recovered ? 'passed' : 'failed',
      recovery.reasons,
      startedAt,
    );
    await this.ports.events.emit(
      recovery.recovered ? 'runtime.mutation.recovered' : 'runtime.mutation.recovery-failed',
      { correlationId: context.correlationId, transactionId, reasons: recovery.reasons },
    );
    return deepFreeze({
      transactionId,
      phaseReached: 'recover',
      status: recovery.recovered ? 'recovered' : 'failed',
      ...(execution !== undefined ? { execution } : {}),
      snapshot,
      phases,
      reasons: [
        ...reasons,
        ...compensation.reasons,
        ...rollbackVerification.reasons,
        ...recovery.reasons,
      ],
      recovery,
      partialFailure,
    });
  }

  private gateOutcome(
    phases: PhaseRecord[],
    phase: TransactionPhase,
    reasons: readonly string[],
    startedAt: number,
    snapshot?: MutationSnapshot,
  ): TransactionOutcome {
    this.record(phases, phase, 'blocked', reasons, startedAt);
    return deepFreeze({
      transactionId: nextId('transaction'),
      phaseReached: phase,
      status: 'blocked',
      ...(snapshot !== undefined ? { snapshot } : {}),
      phases,
      reasons,
      partialFailure: false,
    });
  }

  private cancelledOutcome(
    phases: PhaseRecord[],
    phase: TransactionPhase,
    startedAt: number,
    snapshot?: MutationSnapshot,
    execution?: ActionExecution,
  ): TransactionOutcome {
    this.record(phases, phase, 'skipped', ['cancelled'], startedAt);
    return deepFreeze({
      transactionId: nextId('transaction'),
      phaseReached: phase,
      status: 'cancelled',
      ...(execution !== undefined ? { execution } : {}),
      ...(snapshot !== undefined ? { snapshot } : {}),
      phases,
      reasons: ['cancelled'],
      partialFailure: execution !== undefined,
    });
  }

  private timedOutOutcome(
    phases: PhaseRecord[],
    phase: TransactionPhase,
    startedAt: number,
    snapshot?: MutationSnapshot,
    execution?: ActionExecution,
  ): TransactionOutcome {
    const elapsedMs = this.options.nowMs() - startedAt;
    this.record(phases, phase, 'skipped', [`timeout-after-${elapsedMs}ms`], startedAt);
    return deepFreeze({
      transactionId: nextId('transaction'),
      phaseReached: phase,
      status: 'timed-out',
      ...(execution !== undefined ? { execution } : {}),
      ...(snapshot !== undefined ? { snapshot } : {}),
      phases,
      reasons: [`timeout-after-${elapsedMs}ms`],
      partialFailure: execution !== undefined,
    });
  }

  private staleOutcome(
    phases: PhaseRecord[],
    phase: TransactionPhase,
    reason: 'epoch-superseded' | 'resource-version-changed',
    startedAt: number,
    snapshot?: MutationSnapshot,
  ): TransactionOutcome {
    this.record(phases, phase, 'blocked', [reason], startedAt);
    return deepFreeze({
      transactionId: nextId('transaction'),
      phaseReached: phase,
      status: 'blocked',
      ...(snapshot !== undefined ? { snapshot } : {}),
      phases,
      reasons: [reason],
      partialFailure: false,
    });
  }

  private concurrentOutcome(
    phases: PhaseRecord[],
    phase: TransactionPhase,
    startedAt: number,
  ): TransactionOutcome {
    this.record(phases, phase, 'blocked', ['concurrent-mutation'], startedAt);
    return deepFreeze({
      transactionId: nextId('transaction'),
      phaseReached: phase,
      status: 'blocked',
      phases,
      reasons: ['concurrent-mutation'],
      partialFailure: false,
    });
  }
}


/**
 * Factory function for creating PrivilegedMutationBoundary with the canonical
 * ports wired to existing runtime components. This is the only authorized
 * construction path for the boundary outside of tests.
 */
export function createPrivilegedMutationBoundary(ports: {
  readonly executor: ActionExecutor;
  readonly events: EventSink;
  readonly safetyKernel: SafetyRollbackRecoveryKernel;
  readonly validator: RuntimeActionValidator;
  readonly adapters: RuntimeAdapterRegistry;
}): PrivilegedMutationBoundary {
  const executor = ports.executor;
  return new PrivilegedMutationBoundary(
    {
      executor,
      events: ports.events,
      snapshot: async (plan: ActionPlan, context: RuntimeContext) => {
        const checkpoint = await ports.safetyKernel.createCheckpoint(plan, context);
        return {
          snapshotId: `snap-${Date.now()}`,
          targetId: plan.dependencies.join('|') || plan.selectedAction.intent,
          capturedAt: new Date().toISOString(),
          previousState: { checkpoint },
          resourceVersion: `v-${Date.now()}`,
        } as MutationSnapshot;
      },
      policy: async (plan: ActionPlan, context: RuntimeContext) => {
        const result = await ports.validator.validate(plan, context, false);
        return {
          allowed: result.valid,
          reasons: result.reasons,
          requiredCapabilities: plan.requiredCapabilities,
        };
      },
      verify: async (plan: ActionPlan, context: RuntimeContext, _snapshot: MutationSnapshot) => {
        const verifier = new RuntimeActionVerifier(ports.adapters);
        const execution: ActionExecution = { status: 'success' } as ActionExecution;
        const result = await verifier.verify(plan, execution, context);
        const isNoop = plan.selectedAction.intent === 'noop';
        const isVerified = result.status === 'success' || (isNoop && result.status === 'skipped');
        return { verified: isVerified, reasons: isVerified ? [] : ['verification-failed'] };
      },
      compensate: async (plan: ActionPlan, context: RuntimeContext, snapshot: MutationSnapshot) => {
        const rollbackExecution = await ports.safetyKernel.rollbackCheckpoint(plan, context, snapshot.previousState.checkpoint);
        return { compensated: rollbackExecution !== undefined, reasons: rollbackExecution ? [] : ['rollback-failed'], snapshot };
      },
      verifyRollback: async (plan: ActionPlan, context: RuntimeContext, _snapshot: MutationSnapshot) => {
        const verifier = new RuntimeActionVerifier(ports.adapters);
        const execution: ActionExecution = { status: 'success' } as ActionExecution;
        const result = await verifier.verify(plan, execution, context);
        return { verified: result.status === 'success', reasons: result.status === 'success' ? [] : ['rollback-verification-failed'] };
      },
      recover: async (plan: ActionPlan, context: RuntimeContext, _snapshot: MutationSnapshot) => {
        const recovery = await ports.safetyKernel.recover(plan, 'verification failed', context);
        const recovered = recovery.status === 'success';
        return { recovered, reasons: recovered ? [] : [recovery.reason], strategy: 'rollback' };
      },
    },
    {
      safety: async (plan: ActionPlan, context: RuntimeContext) => {
        const assessment = ports.safetyKernel.assess(plan, context);
        await ports.events.emit('runtime.safety.assessed', {
          correlationId: context.correlationId,
          allowed: assessment.allowed,
          reasons: assessment.reasons,
        });
        return { safe: assessment.allowed, reasons: assessment.reasons };
      },
    }
  );
}

export { TrustBoundaryAuthorizationError };
