import { deepFreeze } from '../domain/ids.js';
export class SafetyViolationError extends Error {
    assessment;
    code = 'SAFETY_VIOLATION';
    constructor(assessment) {
        super(`Action blocked by safety kernel: ${assessment.reasons.join('; ')}`);
        this.assessment = assessment;
        this.name = 'SafetyViolationError';
    }
}
const finiteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const metadataNumber = (plan, key) => {
    const value = plan.metadata[key];
    return finiteNumber(value) ? value : undefined;
};
/**
 * The canonical safety port consumed by `PrivilegedMutationBoundary`.
 *
 * This class deliberately has no execution method. It assesses, checkpoints and
 * recovers, but it never applies a mutation itself: applying requires the
 * privileged boundary, so a caller cannot reach an executor through the safety
 * port and bypass the policy/security/safety/verify/commit phase machine.
 */
export class SafetyRollbackRecoveryKernel {
    events;
    recovery;
    maxBlastRadius;
    constructor(events, recovery, options = {}) {
        this.events = events;
        this.recovery = recovery;
        this.maxBlastRadius = options.maxBlastRadius ?? 0.75;
        if (!finiteNumber(this.maxBlastRadius) || this.maxBlastRadius < 0 || this.maxBlastRadius > 1) {
            throw new RangeError('maxBlastRadius must be a finite number between 0 and 1');
        }
        this.checkpoint = options.checkpoint;
        this.rollback = options.rollback;
    }
    checkpoint;
    rollback;
    assess(plan, context) {
        const reasons = [];
        const action = plan.selectedAction;
        const mutating = action.intent !== 'noop';
        if (!context.cancelled) {
            const deadline = Date.parse(context.deadline);
            if (!Number.isFinite(deadline))
                reasons.push('context deadline is invalid');
            else if (Date.now() >= deadline)
                reasons.push('context deadline has expired');
        }
        else {
            reasons.push('context is cancelled');
        }
        if (!plan.policyResult.allowed)
            reasons.push('plan policy result is not allowed');
        if (!context.securityContext.trusted && mutating && context.mode !== 'simulation') {
            reasons.push('trusted authorization is required for mutation');
        }
        if (mutating && context.mode === 'live' && context.policySnapshot.policy.simulationOnly) {
            reasons.push('policy is simulation-only');
        }
        if (!finiteNumber(plan.risk) || plan.risk < 0 || plan.risk > 1) {
            reasons.push('plan risk is invalid');
        }
        const explicitBlastRadius = metadataNumber(plan, 'blastRadius');
        const blastRadius = explicitBlastRadius ?? plan.risk;
        if (!finiteNumber(blastRadius) || blastRadius < 0 || blastRadius > 1) {
            reasons.push('blast radius is invalid');
        }
        else if (blastRadius > this.maxBlastRadius) {
            reasons.push(`blast radius ${blastRadius} exceeds limit ${this.maxBlastRadius}`);
        }
        if (mutating &&
            action.requiredCapabilities.some((cap) => !context.capabilitySnapshot.capabilities.includes(cap))) {
            reasons.push('required capability is not present in the trusted capability snapshot');
        }
        return deepFreeze({ allowed: reasons.length === 0, reasons, blastRadius });
    }
    async createCheckpoint(plan, context) {
        if (!this.checkpoint || plan.selectedAction.intent === 'noop')
            return undefined;
        return this.checkpoint(plan, context);
    }
    async rollbackCheckpoint(plan, context, checkpoint) {
        if (!this.rollback)
            return undefined;
        return this.rollback(plan, context, checkpoint);
    }
    async recover(plan, reason, context, transactionId) {
        const identity = {
            correlationId: context.correlationId,
            actionId: plan.selectedAction.id,
            ...(transactionId !== undefined ? { transactionId } : {}),
        };
        await this.events.emit('runtime.safety.recovery.started', {
            ...identity,
            reason,
        });
        const result = await this.recovery.recover(plan, reason, context);
        await this.events.emit('runtime.safety.recovery.completed', {
            ...identity,
            reason,
            status: result.status,
        });
        return result;
    }
}
//# sourceMappingURL=safety-kernel.js.map