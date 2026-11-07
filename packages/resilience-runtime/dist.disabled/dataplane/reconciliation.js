/**
 * Phase 134 — Data-Plane Assurance & Safe Reconciliation.
 *
 * Detects drift between desired and observed data-plane state and reconciles in
 * bounded, make-before-break passes with a dead-man switch: every applied pass
 * must be confirmed by a verification probe within a deadline or the inverse
 * plan is applied automatically. Reconciliation is a loop client only — passes
 * run through the Phase 128 governed apply path.
 */
import { applyDataPlanePlan, compileEnforcementPlan } from './abstraction.js';
export const detectDrift = (desired, observed, owner) => {
    const mine = observed.filter((r) => r.owner === owner);
    const obs = new Map(mine.map((r) => [r.id, r]));
    const want = new Map(desired.map((r) => [r.id, r]));
    const missing = desired.filter((r) => !obs.has(r.id)).map((r) => r.id).sort();
    const unexpected = mine.filter((r) => !want.has(r.id)).map((r) => r.id).sort();
    const diverged = desired.filter((r) => obs.has(r.id) && JSON.stringify({ ...r }) !== JSON.stringify({ ...obs.get(r.id) })).map((r) => r.id).sort();
    return Object.freeze({ missing: Object.freeze(missing), unexpected: Object.freeze(unexpected), diverged: Object.freeze(diverged), inSync: missing.length + unexpected.length + diverged.length === 0 });
};
export const splitPlan = (plan, maxOps) => {
    if (!Number.isInteger(maxOps) || maxOps < 1)
        throw new Error('maxOpsPerPass must be a positive integer');
    if (plan.ops.length <= maxOps)
        return plan;
    const ops = plan.ops.slice(0, maxOps);
    // The inverse tail that matches the first `maxOps` operations.
    const inverse = plan.inverse.slice(plan.inverse.length - maxOps);
    return Object.freeze({ ops: Object.freeze(ops), inverse: Object.freeze(inverse), rejected: plan.rejected });
};
const withDeadline = async (ms, work) => {
    const ctl = new AbortController();
    let timer;
    try {
        return await Promise.race([work(ctl.signal), new Promise((resolve) => { timer = setTimeout(() => { ctl.abort(); resolve(false); }, ms); })]);
    }
    catch {
        return false;
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
};
/** One governed reconciliation pass. `transactionId` comes from the privileged mutation boundary. */
export const reconcileOnce = async (desired, backend, verifier, owner, transactionId, options = {}) => {
    const caps = backend.capabilities;
    const observed = await backend.list();
    const full = compileEnforcementPlan(desired, observed, caps, owner);
    if (full.rejected.length)
        return Object.freeze({ status: 'rejected', appliedOps: 0, remainingOps: full.ops.length, reasons: Object.freeze(full.rejected.map((r) => `${r.ruleId}:${r.reason}`)) });
    if (full.ops.length === 0)
        return Object.freeze({ status: 'in-sync', appliedOps: 0, remainingOps: 0, reasons: Object.freeze(['no-drift']) });
    const pass = splitPlan(full, options.maxOpsPerPass ?? 20);
    const result = await applyDataPlanePlan(pass, backend, transactionId, options.signal);
    if (result.status === 'rejected')
        return Object.freeze({ status: 'rejected', appliedOps: 0, remainingOps: full.ops.length, reasons: Object.freeze([result.error ?? 'rejected']) });
    if (result.status !== 'applied')
        return Object.freeze({ status: result.status === 'rollback-failed' ? 'revert-failed' : 'apply-failed', appliedOps: result.applied, remainingOps: full.ops.length, reasons: Object.freeze([result.error ?? result.status]) });
    const confirmed = await withDeadline(options.confirmDeadlineMs ?? 10_000, (s) => verifier.verify(desired, s));
    if (!confirmed) {
        // Dead-man switch: unconfirmed changes are reverted with the exact inverse plan.
        const undo = Object.freeze({ ops: pass.inverse, inverse: pass.ops, rejected: Object.freeze([]) });
        const reverted = await applyDataPlanePlan(undo, backend, transactionId);
        return Object.freeze({ status: reverted.status === 'applied' || reverted.status === 'noop' ? 'reverted' : 'revert-failed', appliedOps: 0, remainingOps: full.ops.length, reasons: Object.freeze(['verification-not-confirmed', ...(reverted.error ? [reverted.error] : [])]) });
    }
    const remaining = full.ops.length - pass.ops.length;
    return Object.freeze({ status: remaining > 0 ? 'partial' : 'confirmed', appliedOps: pass.ops.length, remainingOps: remaining, reasons: Object.freeze([remaining > 0 ? 'more-passes-required' : 'verified']) });
};
//# sourceMappingURL=reconciliation.js.map