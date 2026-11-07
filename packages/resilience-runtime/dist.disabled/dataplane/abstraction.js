/**
 * Phase 128 — Data-Plane Abstraction & Enforcement.
 *
 * A vendor-neutral rule model plus a compiler that turns desired rules into an
 * ordered operation plan with exact inverse operations, validated against the
 * backend's declared capabilities. `applyDataPlanePlan` applies a plan
 * transactionally (rollback on first failure) but requires a transaction id
 * issued by the privileged mutation boundary, so it can only run as part of a
 * governed mutation; nothing else in the system may call a backend directly.
 */
import { cidrOverlaps, parseCidr } from './cidr.js';
export class DataPlaneValidationError extends Error {
    violations;
    constructor(violations) {
        super(`invalid data-plane rules: ${violations.join('; ')}`);
        this.violations = violations;
        this.name = 'DataPlaneValidationError';
    }
}
export const validateRule = (rule, caps) => {
    const v = [];
    if (!rule.id.trim())
        v.push('rule id required');
    if (!rule.owner.trim())
        v.push(`${rule.id}: owner required`);
    if (!Number.isFinite(rule.priority))
        v.push(`${rule.id}: priority must be finite`);
    if (!caps.actions.includes(rule.action.type))
        v.push(`${rule.id}: action ${rule.action.type} unsupported by backend ${caps.id}`);
    if (rule.action.type === 'rate-limit' && !(rule.action.kbps > 0))
        v.push(`${rule.id}: rate limit must be positive`);
    const pr = rule.match.destinationPorts;
    if (pr) {
        if (!caps.supportsPortRanges && pr[0] !== pr[1])
            v.push(`${rule.id}: backend does not support port ranges`);
        if (pr[0] > pr[1] || pr[0] < 0 || pr[1] > 65_535)
            v.push(`${rule.id}: invalid port range`);
        if (rule.match.protocol === 'icmp')
            v.push(`${rule.id}: ports do not apply to icmp`);
    }
    for (const key of ['sourceCidr', 'destinationCidr']) {
        const text = rule.match[key];
        if (text === undefined)
            continue;
        try {
            const c = parseCidr(text);
            if (c.family === 6 && !caps.supportsIpv6)
                v.push(`${rule.id}: backend does not support IPv6`);
        }
        catch (e) {
            v.push(`${rule.id}: ${e.message}`);
        }
    }
    return v;
};
const sameRule = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const canonical = (r) => ({ id: r.id, priority: r.priority, owner: r.owner, match: { ...r.match }, action: { ...r.action } });
/** Plans the operations needed to move `current` to `desired`, restricted to rules owned by `owner`. */
export const compileEnforcementPlan = (desired, current, caps, owner) => {
    const ids = new Set();
    const violations = [];
    const rejected = [];
    for (const r of desired) {
        if (ids.has(r.id))
            violations.push(`duplicate rule id ${r.id}`);
        ids.add(r.id);
        if (r.owner !== owner)
            violations.push(`${r.id}: rule owner ${r.owner} is not ${owner}`);
        for (const reason of validateRule(r, caps))
            rejected.push({ ruleId: r.id, reason });
    }
    if (violations.length)
        throw new DataPlaneValidationError(violations);
    const bad = new Set(rejected.map((r) => r.ruleId));
    const wanted = desired.filter((r) => !bad.has(r.id));
    const mine = current.filter((r) => r.owner === owner);
    const foreign = current.length - mine.length;
    if (foreign + wanted.length > caps.maxRules)
        rejected.push({ ruleId: '*', reason: `rule budget exceeded (${foreign + wanted.length} > ${caps.maxRules})` });
    if (rejected.some((r) => r.ruleId === '*'))
        return Object.freeze({ ops: Object.freeze([]), inverse: Object.freeze([]), rejected: Object.freeze(rejected) });
    const byId = new Map(mine.map((r) => [r.id, r]));
    const ops = [];
    const inverse = [];
    // Make-before-break: install and replace first, remove last, so coverage never lapses.
    for (const r of [...wanted].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))) {
        const cur = byId.get(r.id);
        if (!cur) {
            ops.push({ kind: 'install', rule: r });
            inverse.unshift({ kind: 'remove', ruleId: r.id });
        }
        else if (!sameRule(cur, r)) {
            ops.push({ kind: 'replace', rule: r });
            inverse.unshift({ kind: 'replace', rule: cur });
        }
    }
    const wantedIds = new Set(wanted.map((r) => r.id));
    for (const cur of [...mine].sort((a, b) => a.id.localeCompare(b.id))) {
        if (!wantedIds.has(cur.id) && !bad.has(cur.id)) {
            ops.push({ kind: 'remove', ruleId: cur.id });
            inverse.unshift({ kind: 'install', rule: cur });
        }
    }
    return Object.freeze({ ops: Object.freeze(ops), inverse: Object.freeze(inverse), rejected: Object.freeze(rejected) });
};
/**
 * Applies a plan transactionally. `transactionId` must be the id of a transaction opened by the
 * privileged mutation boundary; an empty id is refused so ungoverned callers cannot enforce rules.
 */
export const applyDataPlanePlan = async (plan, backend, transactionId, signal = new AbortController().signal) => {
    if (!transactionId.trim())
        return Object.freeze({ status: 'rejected', transactionId, applied: 0, error: 'governed-transaction-required' });
    if (plan.ops.length === 0)
        return Object.freeze({ status: 'noop', transactionId, applied: 0 });
    let applied = 0;
    try {
        for (const op of plan.ops) {
            if (signal.aborted)
                throw new Error('aborted');
            await backend.apply(op, signal);
            applied += 1;
        }
        return Object.freeze({ status: 'applied', transactionId, applied });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'apply-failed';
        // Undo only what was applied: the last `applied` inverse ops correspond to those operations, in reverse order.
        const undo = plan.inverse.slice(plan.inverse.length - applied);
        try {
            for (const op of undo)
                await backend.apply(op, new AbortController().signal);
            return Object.freeze({ status: 'rolled-back', transactionId, applied: 0, error: message });
        }
        catch (rollbackError) {
            return Object.freeze({ status: 'rollback-failed', transactionId, applied, error: `${message}; rollback: ${rollbackError instanceof Error ? rollbackError.message : 'failed'}` });
        }
    }
};
/** Detects rules of one backend whose matches overlap with differing actions at equal priority (ambiguous). */
export const findAmbiguousRules = (rules) => {
    const out = [];
    const sorted = [...rules].sort((a, b) => a.id.localeCompare(b.id));
    for (let i = 0; i < sorted.length; i += 1)
        for (let j = i + 1; j < sorted.length; j += 1) {
            const a = sorted[i];
            const b = sorted[j];
            if (a.priority !== b.priority || JSON.stringify(a.action) === JSON.stringify(b.action))
                continue;
            const overlap = ['sourceCidr', 'destinationCidr'].every((k) => {
                const x = a.match[k];
                const y = b.match[k];
                return x === undefined || y === undefined || cidrOverlaps(parseCidr(x), parseCidr(y));
            });
            if (overlap && (a.match.protocol === b.match.protocol || !a.match.protocol || !b.match.protocol || a.match.protocol === 'any' || b.match.protocol === 'any'))
                out.push([a.id, b.id]);
        }
    return out;
};
//# sourceMappingURL=abstraction.js.map