/**
 * Phase 95 — Policy-Based Routing.
 *
 * Declarative routing policies map traffic classifications onto the existing
 * `FabricSelectionRequest` constraint vocabulary. Policies only narrow or order
 * fabric selection; they cannot select a resource directly and cannot mutate.
 * Invalid or conflicting policy sets fail closed.
 */
export class RoutingPolicyValidationError extends Error {
    violations;
    constructor(violations) {
        super(`invalid routing policy set: ${violations.join('; ')}`);
        this.violations = violations;
        this.name = 'RoutingPolicyValidationError';
    }
}
export const validateRoutingPolicies = (rules) => {
    const violations = [];
    const ids = new Set();
    const priorities = new Map();
    for (const rule of rules) {
        if (!rule.id.trim())
            violations.push('rule id is required');
        if (ids.has(rule.id))
            violations.push(`duplicate rule id ${rule.id}`);
        ids.add(rule.id);
        if (!Number.isFinite(rule.priority))
            violations.push(`${rule.id}: priority must be finite`);
        const clash = priorities.get(rule.priority);
        if (clash !== undefined)
            violations.push(`${rule.id}: priority ${rule.priority} collides with ${clash}`);
        priorities.set(rule.priority, rule.id);
        const c = rule.constraints;
        if (c?.minimumTrust !== undefined && (c.minimumTrust < 0 || c.minimumTrust > 1))
            violations.push(`${rule.id}: minimumTrust must be within [0,1]`);
        if (c?.maximumCost !== undefined && c.maximumCost < 0)
            violations.push(`${rule.id}: maximumCost must be non-negative`);
        if (c?.minimumDiverseAlternatives !== undefined && (!Number.isInteger(c.minimumDiverseAlternatives) || c.minimumDiverseAlternatives < 1))
            violations.push(`${rule.id}: minimumDiverseAlternatives must be a positive integer`);
        if (rule.action === 'deny' && rule.constraints)
            violations.push(`${rule.id}: deny rules cannot carry constraints`);
        const h = rule.match.utcHours;
        if (h && (h[0] < 0 || h[0] > 23 || h[1] < 0 || h[1] > 24))
            violations.push(`${rule.id}: utcHours out of range`);
        const m = rule.match;
        if (!m.trafficClasses && !m.applications && !m.tenants && !m.utcHours)
            violations.push(`${rule.id}: rule must match on at least one attribute`);
    }
    if (violations.length)
        throw new RoutingPolicyValidationError(violations);
    return Object.freeze([...rules].sort((a, b) => a.priority - b.priority));
};
const inHourWindow = (window, now) => {
    const hour = new Date(now).getUTCHours();
    const [start, end] = window;
    return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
};
const matches = (rule, ctx) => {
    const m = rule.match;
    if (m.trafficClasses && !m.trafficClasses.includes(ctx.classification.trafficClass))
        return false;
    if (m.applications && (!ctx.classification.application || !m.applications.includes(ctx.classification.application)))
        return false;
    if (m.tenants && (!ctx.tenant || !m.tenants.includes(ctx.tenant)))
        return false;
    if (m.utcHours && !inHourWindow(m.utcHours, ctx.now))
        return false;
    return true;
};
/** Resolves the first matching policy into a fabric selection request. */
export const resolveRoutingPolicy = (rules, ctx) => {
    let ordered;
    try {
        ordered = validateRoutingPolicies(rules);
    }
    catch (error) {
        return Object.freeze({ outcome: 'deny', reasons: Object.freeze([`fail-closed: ${error.message}`]) });
    }
    for (const rule of ordered) {
        if (!matches(rule, ctx))
            continue;
        if (rule.action === 'deny')
            return Object.freeze({ outcome: 'deny', ruleId: rule.id, reasons: Object.freeze([`denied-by:${rule.id}`]) });
        const c = rule.constraints ?? {};
        const request = Object.freeze({
            now: ctx.now,
            ...(c.kind ? { kind: c.kind } : {}),
            ...(c.minimumTrust !== undefined ? { minimumTrust: c.minimumTrust } : {}),
            ...(c.maximumCost !== undefined ? { maximumCost: c.maximumCost } : {}),
            ...(c.requiredCapabilities ? { requiredCapabilities: c.requiredCapabilities } : {}),
            ...(c.preferredFailureDomains ? { preferredFailureDomains: c.preferredFailureDomains } : {}),
            ...(c.minimumDiverseAlternatives !== undefined ? { minimumDiverseAlternatives: c.minimumDiverseAlternatives } : {}),
            ...(c.maximumSafety ? { maximumSafety: c.maximumSafety } : {}),
            ...(c.maxAgeMs !== undefined ? { maxAgeMs: c.maxAgeMs } : {}),
            intent: Object.freeze({
                intentId: `policy:${rule.id}`,
                target: Object.freeze({ ...(ctx.classification.application ? { 'routing.application': ctx.classification.application } : {}) }),
                constraints: Object.freeze({}),
                objectives: Object.freeze({}),
            }),
        });
        return Object.freeze({ outcome: 'route', ruleId: rule.id, request, reasons: Object.freeze([`matched:${rule.id}`]) });
    }
    return Object.freeze({ outcome: 'no-policy', reasons: Object.freeze(['no-matching-routing-policy']) });
};
/**
 * Applies a policy then delegates to the one fabric selection boundary. A deny
 * decision or an invalid policy set never reaches `fabric.select`.
 */
export const selectWithRoutingPolicy = (fabric, rules, ctx, base = {}) => {
    const decision = resolveRoutingPolicy(rules, ctx);
    if (decision.outcome === 'deny')
        return Object.freeze({ decision, allowed: false });
    const request = decision.request ? { ...base, ...decision.request } : { ...base, now: ctx.now };
    return Object.freeze({ decision, selection: fabric.select(request), allowed: true });
};
//# sourceMappingURL=policy-routing.js.map