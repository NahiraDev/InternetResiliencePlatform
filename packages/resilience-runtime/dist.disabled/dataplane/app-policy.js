/**
 * Phase 131 — Service/Application Policy Enforcement.
 *
 * Per-application path policies (allowed resource kinds, required trust,
 * excluded failure domains, maximum cost, pinning) evaluated against candidate
 * fabric resources and compiled into data-plane steering rules. Conflicting
 * policies are detected rather than resolved silently.
 */
const costOf = (r) => Object.values(r.cost).reduce((s, v) => s + Math.max(0, v), 0);
export const evaluateApplicationPolicy = (policy, candidates) => {
    const permitted = [];
    const violations = [];
    for (const r of candidates) {
        const reasons = [];
        if (policy.pinnedResourceId && r.id !== policy.pinnedResourceId)
            reasons.push('not-the-pinned-resource');
        if (policy.allowedKinds && !policy.allowedKinds.includes(r.kind))
            reasons.push(`kind-${r.kind.toLowerCase()}-not-allowed`);
        if (policy.minimumTrust !== undefined && r.trust < policy.minimumTrust)
            reasons.push('insufficient-trust');
        if (policy.maximumCost !== undefined && costOf(r) > policy.maximumCost)
            reasons.push('cost-limit');
        const hit = policy.excludedFailureDomains?.filter((d) => r.failureDomains.includes(d)) ?? [];
        if (hit.length)
            reasons.push(`excluded-failure-domain:${hit.join(',')}`);
        const missing = policy.requiredFailureDomains?.filter((d) => !r.failureDomains.includes(d)) ?? [];
        if (missing.length)
            reasons.push(`missing-required-failure-domain:${missing.join(',')}`);
        if (reasons.length)
            violations.push(Object.freeze({ resourceId: r.id, reasons: Object.freeze(reasons) }));
        else
            permitted.push(r);
    }
    return Object.freeze({ application: policy.application, permitted: Object.freeze(permitted), violations: Object.freeze(violations) });
};
/** Detects policies that can never be satisfied together for the same destinations. */
export const detectPolicyConflicts = (policies) => {
    const out = [];
    const sorted = [...policies].sort((a, b) => a.application.localeCompare(b.application));
    for (const p of sorted) {
        const both = p.requiredFailureDomains?.filter((d) => p.excludedFailureDomains?.includes(d)) ?? [];
        if (both.length)
            out.push({ a: p.application, b: p.application, reason: `failure-domain-required-and-excluded:${both.join(',')}` });
        if (p.minimumTrust !== undefined && (p.minimumTrust < 0 || p.minimumTrust > 1))
            out.push({ a: p.application, b: p.application, reason: 'invalid-minimum-trust' });
    }
    for (let i = 0; i < sorted.length; i += 1)
        for (let j = i + 1; j < sorted.length; j += 1) {
            const a = sorted[i];
            const b = sorted[j];
            const shared = a.destinationCidrs.filter((c) => b.destinationCidrs.includes(c));
            if (shared.length === 0)
                continue;
            if (a.pinnedResourceId && b.pinnedResourceId && a.pinnedResourceId !== b.pinnedResourceId)
                out.push({ a: a.application, b: b.application, reason: `different-pins-for-shared-destination:${shared.join(',')}` });
            if (a.priority === b.priority)
                out.push({ a: a.application, b: b.application, reason: `equal-priority-on-shared-destination:${shared.join(',')}` });
        }
    return Object.freeze(out);
};
/** Steering rules for the chosen permitted resource of each policy; policies with no permitted resource produce no rule (fail closed to existing routing). */
export const compileSteeringRules = (policies, chosen, owner) => {
    const rules = [];
    for (const p of policies) {
        const pathId = chosen[p.application];
        if (!pathId)
            continue;
        p.destinationCidrs.forEach((cidr, i) => rules.push({ id: `app-${p.application}-${i}`, priority: p.priority, owner, match: { destinationCidr: cidr }, action: { type: 'steer', pathId } }));
    }
    return Object.freeze(rules);
};
//# sourceMappingURL=app-policy.js.map