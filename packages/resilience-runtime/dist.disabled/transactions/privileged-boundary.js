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
import { RuntimeActionVerifier } from '../verification/verification.js';
import { RuntimePolicyArbitrator } from '../policy/policy.js';
import { TrustBoundaryAuthorizationError, TrustBoundaryAuthorizer, enforceAiAdvisoryBoundary, } from '../security/trust-boundaries.js';
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
];
export const RECOVERY_PHASES = ['rollback', 'verifyRollback', 'recover'];
export class ConcurrentMutationError extends Error {
    mutationId;
    holderId;
    code = 'CONCURRENT_MUTATION';
    constructor(mutationId, holderId) {
        super(`mutation '${mutationId}' is already held by '${holderId}'`);
        this.mutationId = mutationId;
        this.holderId = holderId;
        this.name = 'ConcurrentMutationError';
    }
}
const MAX_IDEMPOTENCY_ENTRIES = 1_000;
/**
 * The one place a privileged network mutation may happen.
 *
 * There is no other code path: the executor port is private to this class, so a
 * caller cannot obtain it and bypass the gates.
 */
export class PrivilegedMutationBoundary {
    ports;
    authorizer;
    options;
    /** Bound action id per idempotency key, so a rebind can be refused. */
    completed = new Map();
    inFlight = new Map();
    held = new Map();
    epoch;
    counter = 0;
    constructor(ports, options) {
        this.ports = ports;
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
    advanceEpoch() {
        this.epoch += 1;
        return this.epoch;
    }
    currentEpoch() {
        return this.epoch;
    }
    heldMutations() {
        return Object.freeze([...this.held.keys()]);
    }
    /**
     * Runs a mutation through the canonical phase machine.
     *
     * Never throws for gate rejection: a blocked phase is a recorded outcome, so
     * callers cannot accidentally treat a denial as success.
     */
    async mutate(request) {
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
        if (active)
            return active;
        const run = this.runMachine(request).finally(() => {
            this.inFlight.delete(idempotencyKey);
        });
        this.inFlight.set(idempotencyKey, run);
        const outcome = await run;
        this.completed.set(idempotencyKey, { actionId, outcome });
        while (this.completed.size > MAX_IDEMPOTENCY_ENTRIES) {
            this.completed.delete(this.completed.keys().next().value);
        }
        return outcome;
    }
    blocked(phase, reasons) {
        return deepFreeze({
            transactionId: nextId('transaction'),
            phaseReached: phase,
            status: 'blocked',
            phases: [deepFreeze({ phase, status: 'blocked', reasons, at: nowIso() })],
            reasons,
            partialFailure: false,
        });
    }
    record(phases, phase, status, reasons = [], startedAt) {
        const nowMs = this.options.nowMs();
        phases.push(deepFreeze({
            phase,
            status,
            reasons,
            at: new Date(nowMs).toISOString(),
            ...(startedAt !== undefined ? { durationMs: nowMs - startedAt } : {}),
        }));
    }
    async runMachine(request) {
        const phases = [];
        const transactionId = request.transactionId ?? nextId('transaction');
        const startedAt = this.options.nowMs();
        const { plan, context, actor } = request;
        const budget = () => startedAt + this.options.mutationTimeoutMs;
        const timeout = () => this.options.nowMs() > budget();
        const cancelled = () => context.cancelled === true;
        // --- prepare -----------------------------------------------------------
        if (cancelled())
            return this.cancelledOutcome(phases, 'prepare', startedAt);
        if (timeout())
            return this.timedOutOutcome(phases, 'prepare', startedAt);
        // Stale/concurrent protection: an epoch older than the boundary's, or a
        // mutation already held elsewhere, is rejected before any work.
        if (request.epoch !== undefined && request.epoch !== this.epoch) {
            return this.staleOutcome(phases, 'prepare', 'epoch-superseded', startedAt);
        }
        if (this.held.has(request.resourceId) &&
            this.held.get(request.resourceId) !== request.mutationId) {
            return this.concurrentOutcome(phases, 'prepare', startedAt);
        }
        this.counter += 1;
        this.held.set(request.resourceId, request.mutationId);
        this.record(phases, 'prepare', 'passed', [], startedAt);
        try {
            // --- snapshot --------------------------------------------------------
            const snapshot = await this.ports.snapshot(plan, context);
            this.record(phases, 'snapshot', 'passed', [], startedAt);
            if (request.resourceVersion !== undefined &&
                snapshot.resourceVersion !== request.resourceVersion) {
                return this.staleOutcome(phases, 'snapshot', 'resource-version-changed', startedAt, snapshot);
            }
            // --- validate --------------------------------------------------------
            if (cancelled())
                return this.cancelledOutcome(phases, 'validate', startedAt, snapshot);
            if (timeout())
                return this.timedOutOutcome(phases, 'validate', startedAt, snapshot);
            if (plan.selectedAction.rejectionReasons.length > 0) {
                return this.gateOutcome(phases, 'validate', [...plan.selectedAction.rejectionReasons], startedAt, snapshot);
            }
            this.record(phases, 'validate', 'passed', [], startedAt);
            // --- policy ----------------------------------------------------------
            if (cancelled())
                return this.cancelledOutcome(phases, 'policy', startedAt, snapshot);
            if (timeout())
                return this.timedOutOutcome(phases, 'policy', startedAt, snapshot);
            const policy = await this.ports.policy(plan, context);
            if (!policy.allowed) {
                return this.gateOutcome(phases, 'policy', [...policy.reasons], startedAt, snapshot);
            }
            this.record(phases, 'policy', 'passed', [], startedAt);
            // --- security --------------------------------------------------------
            if (cancelled())
                return this.cancelledOutcome(phases, 'security', startedAt, snapshot);
            if (timeout())
                return this.timedOutOutcome(phases, 'security', startedAt, snapshot);
            // AI may contribute rationale and a recommended intent, never authority.
            // Sanitising here means an AI-suggested capability cannot join the
            // requirement set, and the canonical plan's intent is what is executed.
            const canonical = enforceAiAdvisoryBoundary({
                canonicalIntent: plan.selectedAction.intent,
                canonicalCapabilities: [...plan.requiredCapabilities, ...policy.requiredCapabilities],
                ...(request.ai !== undefined ? { ai: request.ai } : {}),
            });
            if (request.ai?.recommendedIntent !== undefined &&
                request.ai.recommendedIntent !== canonical.intent) {
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
                return this.gateOutcome(phases, 'security', [
                    ...(authorization.reason ? [`reason:${authorization.reason}`] : []),
                    ...authorization.missing.map((capability) => `missing-capability:${capability}`),
                ], startedAt, snapshot);
            }
            this.record(phases, 'security', 'passed', [], startedAt);
            // --- safety ----------------------------------------------------------
            if (cancelled())
                return this.cancelledOutcome(phases, 'safety', startedAt, snapshot);
            if (timeout())
                return this.timedOutOutcome(phases, 'safety', startedAt, snapshot);
            const safety = await this.options.safety(plan, context);
            if (!safety.safe) {
                return this.gateOutcome(phases, 'safety', [...safety.reasons], startedAt, snapshot);
            }
            this.record(phases, 'safety', 'passed', [], startedAt);
            // --- apply -----------------------------------------------------------
            if (cancelled())
                return this.cancelledOutcome(phases, 'apply', startedAt, snapshot);
            if (timeout())
                return this.timedOutOutcome(phases, 'apply', startedAt, snapshot);
            // The boundary owns mutation-attempt identity, so it also announces the
            // transaction. Emitted after the safety gate and before any apply, which
            // is the causal order the taxonomy declares.
            await this.ports.events.emit('runtime.transaction.created', {
                correlationId: context.correlationId,
                transactionId,
            });
            await this.ports.events.emit('runtime.execution.started', {
                correlationId: context.correlationId,
                transactionId,
                actionId: plan.selectedAction.id,
            });
            await this.ports.events.emit('runtime.mutation.applying', {
                correlationId: context.correlationId,
                transactionId,
                mutationId: request.mutationId,
                aiAdvisoryOnly: request.ai !== undefined,
            });
            let execution;
            try {
                execution = await this.ports.executor.execute(plan, context);
            }
            catch (error) {
                await this.ports.events.emit('runtime.execution.failed', {
                    correlationId: context.correlationId,
                    transactionId,
                    actionId: plan.selectedAction.id,
                    error: error instanceof Error ? error.message : 'apply-threw',
                });
                // Partial failure: the mutation was attempted, so it must be compensated.
                return this.failurePath(phases, plan, context, snapshot, [error instanceof Error ? error.message : 'apply-threw'], startedAt, transactionId);
            }
            const applied = execution.status === 'success' || execution.status === 'skipped';
            this.record(phases, 'apply', applied ? 'passed' : 'failed', [], startedAt);
            if (!applied) {
                await this.ports.events.emit('runtime.execution.failed', {
                    correlationId: context.correlationId,
                    transactionId,
                    actionId: plan.selectedAction.id,
                    status: execution.status,
                });
                // A failed apply is a partial-failure candidate: compensate and verify.
                return this.failurePath(phases, plan, context, snapshot, [`apply-status:${execution.status}`], startedAt, transactionId, execution);
            }
            // --- verify ----------------------------------------------------------
            if (cancelled())
                return this.cancelledOutcome(phases, 'verify', startedAt, snapshot, execution);
            if (timeout())
                return this.timedOutOutcome(phases, 'verify', startedAt, snapshot, execution);
            const verification = await this.ports.verify(plan, context, snapshot);
            if (!verification.verified) {
                return this.failurePath(phases, plan, context, snapshot, [...verification.reasons], startedAt, transactionId, execution);
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
        }
        finally {
            this.held.delete(request.resourceId);
        }
    }
    /**
     * Compensation path: rollback -> verifyRollback -> recover.
     * Each step is recorded, and recovery runs whenever compensation is
     * insufficient or unverified.
     */
    async failurePath(phases, plan, context, snapshot, reasons, startedAt, transactionId, execution) {
        const partialFailure = execution !== undefined;
        await this.ports.events.emit('runtime.safety.rollback.started', {
            correlationId: context.correlationId,
            transactionId,
        });
        const compensation = await this.ports.compensate(plan, context, snapshot);
        this.record(phases, 'rollback', compensation.compensated ? 'passed' : 'failed', compensation.reasons, startedAt);
        await this.ports.events.emit(compensation.compensated
            ? 'runtime.safety.rollback.completed'
            : 'runtime.safety.rollback.failed', { correlationId: context.correlationId, transactionId, reasons: compensation.reasons });
        const rollbackVerification = await this.ports.verifyRollback(plan, context, snapshot);
        const rollbackVerified = rollbackVerification.verified;
        this.record(phases, 'verifyRollback', rollbackVerified ? 'passed' : 'failed', rollbackVerification.reasons, startedAt);
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
        const recovery = await this.ports.recover(plan, context, snapshot, transactionId);
        this.record(phases, 'recover', recovery.recovered ? 'passed' : 'failed', recovery.reasons, startedAt);
        await this.ports.events.emit(recovery.recovered ? 'runtime.mutation.recovered' : 'runtime.mutation.recovery-failed', { correlationId: context.correlationId, transactionId, reasons: recovery.reasons });
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
    gateOutcome(phases, phase, reasons, startedAt, snapshot) {
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
    cancelledOutcome(phases, phase, startedAt, snapshot, execution) {
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
    timedOutOutcome(phases, phase, startedAt, snapshot, execution) {
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
    staleOutcome(phases, phase, reason, startedAt, snapshot) {
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
    concurrentOutcome(phases, phase, startedAt) {
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
export function createPrivilegedMutationBoundary(ports) {
    const executor = ports.executor;
    const policyArbitrator = ports.policyArbitrator ?? new RuntimePolicyArbitrator();
    return new PrivilegedMutationBoundary({
        executor,
        events: ports.events,
        snapshot: async (plan, context) => {
            const checkpoint = await ports.safetyKernel.createCheckpoint(plan, context);
            return {
                snapshotId: `snap-${Date.now()}`,
                targetId: plan.dependencies.join('|') || plan.selectedAction.intent,
                capturedAt: new Date().toISOString(),
                previousState: { checkpoint },
                resourceVersion: `v-${Date.now()}`,
            };
        },
        policy: async (plan, context) => {
            // The boundary's policy phase is a policy gate, not a cycle-admission
            // gate. `RuntimeActionValidator.validate` additionally enforces
            // deadline, adapter support, action budget and the runtime's
            // single-flight lock, all of which the owning cycle already applied
            // before entering this boundary. Re-running it here made every
            // mutation conflict with the caller's own lock and blocked it.
            const result = await policyArbitrator.evaluate(plan, context);
            return {
                allowed: result.allowed,
                reasons: result.reasons,
                requiredCapabilities: plan.requiredCapabilities,
            };
        },
        verify: async (plan, context, _snapshot) => {
            const verifier = new RuntimeActionVerifier(ports.adapters);
            const execution = { status: 'success' };
            const result = await verifier.verify(plan, execution, context);
            const isNoop = plan.selectedAction.intent === 'noop';
            const isVerified = result.status === 'success' || (isNoop && result.status === 'skipped');
            return { verified: isVerified, reasons: isVerified ? [] : ['verification-failed'] };
        },
        compensate: async (plan, context, snapshot) => {
            const rollbackExecution = await ports.safetyKernel.rollbackCheckpoint(plan, context, snapshot.previousState.checkpoint);
            if (rollbackExecution !== undefined)
                return { compensated: true, reasons: [], snapshot };
            // No checkpoint rollback is configured. Compensation must still reach the mutation's own
            // adapter, which owns the undo (for routes: the kernel executor's journaled rollback).
            // Reporting `rollback-failed` here without trying left the mutation applied while the
            // transaction went on to report itself recovered.
            const adapter = ports.adapters.findForAction(plan.selectedAction.intent, plan.requiredCapabilities);
            if (!adapter?.rollback || !adapter.descriptor.recoverySupport) {
                return { compensated: false, reasons: ['rollback-failed'], snapshot };
            }
            try {
                const undone = await adapter.rollback(plan, context);
                const ok = undone.status === 'success';
                return { compensated: ok, reasons: ok ? [] : [`adapter-rollback:${undone.status}`], snapshot };
            }
            catch (error) {
                return {
                    compensated: false,
                    reasons: [`adapter-rollback-threw:${error instanceof Error ? error.message : 'unknown'}`],
                    snapshot,
                };
            }
        },
        verifyRollback: async (plan, context, _snapshot) => {
            const adapter = ports.adapters.findForAction(plan.selectedAction.intent, plan.requiredCapabilities);
            if (adapter?.verifyRollback) {
                const proof = await adapter.verifyRollback(plan, context);
                const proven = proof.status === 'success';
                return { verified: proven, reasons: proven ? [] : ['rollback-verification-failed'] };
            }
            const verifier = new RuntimeActionVerifier(ports.adapters);
            const execution = { status: 'success' };
            const result = await verifier.verify(plan, execution, context);
            return { verified: result.status === 'success', reasons: result.status === 'success' ? [] : ['rollback-verification-failed'] };
        },
        recover: async (plan, context, _snapshot, transactionId) => {
            await ports.events.emit('runtime.recovery.started', {
                correlationId: context.correlationId,
                transactionId,
                reason: 'verification failed',
            });
            const recovery = await ports.safetyKernel.recover(plan, 'verification failed', context, transactionId);
            const recovered = recovery.status === 'success';
            await ports.events.emit('runtime.recovery.completed', {
                correlationId: context.correlationId,
                transactionId,
                status: recovery.status,
                strategy: 'rollback',
            });
            return {
                recovered,
                reasons: recovered ? [] : [recovery.reason],
                strategy: 'rollback',
            };
        },
    }, {
        safety: async (plan, context) => {
            const assessment = ports.safetyKernel.assess(plan, context);
            await ports.events.emit('runtime.safety.assessed', {
                correlationId: context.correlationId,
                allowed: assessment.allowed,
                reasons: assessment.reasons,
            });
            return { safe: assessment.allowed, reasons: assessment.reasons };
        },
    });
}
export { TrustBoundaryAuthorizationError };
//# sourceMappingURL=privileged-boundary.js.map