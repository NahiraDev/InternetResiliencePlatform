/**
 * Phase 130 — QoS, Priority & Traffic Engineering.
 *
 * Deterministic bandwidth allocation for traffic classes over a path of finite
 * capacity: guaranteed minimums first, then weighted max-min fair sharing with
 * per-class ceilings (water-filling), with strict-priority protection for
 * realtime and control traffic. The result is a plan; enforcement is a data-plane
 * rule (rate-limit/mark) compiled through Phase 128.
 */
export const DEFAULT_QOS_POLICIES = Object.freeze([
    { trafficClass: 'control', tier: 0, weight: 1, guaranteedKbps: 64, ceilingKbps: 2_000, dscp: 48 },
    { trafficClass: 'realtime', tier: 1, weight: 4, guaranteedKbps: 512, ceilingKbps: 20_000, dscp: 46 },
    { trafficClass: 'interactive', tier: 2, weight: 4, guaranteedKbps: 256, dscp: 26 },
    { trafficClass: 'streaming', tier: 3, weight: 3, guaranteedKbps: 0, dscp: 34 },
    { trafficClass: 'bulk', tier: 4, weight: 1, guaranteedKbps: 0, dscp: 10 },
    { trafficClass: 'background', tier: 5, weight: 1, guaranteedKbps: 0, dscp: 8 },
    { trafficClass: 'unknown', tier: 4, weight: 1, guaranteedKbps: 0, dscp: 0 },
]);
export class QosConfigError extends Error {
    constructor(message) { super(message); this.name = 'QosConfigError'; }
}
export const allocateBandwidth = (capacityKbps, demands, policies = DEFAULT_QOS_POLICIES) => {
    if (!(capacityKbps > 0))
        throw new QosConfigError('capacity must be positive');
    const policy = new Map(policies.map((p) => [p.trafficClass, p]));
    for (const p of policies)
        if (!(p.weight > 0) || p.guaranteedKbps < 0 || (p.ceilingKbps !== undefined && p.ceilingKbps < p.guaranteedKbps))
            throw new QosConfigError(`invalid policy for ${p.trafficClass}`);
    const merged = new Map();
    for (const d of demands)
        merged.set(d.trafficClass, (merged.get(d.trafficClass) ?? 0) + Math.max(0, d.demandKbps));
    const classes = [...merged.keys()].filter((c) => policy.has(c)).sort((a, b) => policy.get(a).tier - policy.get(b).tier || a.localeCompare(b));
    const demand = (c) => Math.min(merged.get(c), policy.get(c).ceilingKbps ?? Number.POSITIVE_INFINITY);
    const alloc = new Map(classes.map((c) => [c, 0]));
    let remaining = capacityKbps;
    const unmet = [];
    // 1. Guarantees in strict tier order, bounded by demand and what is left.
    for (const c of classes) {
        const want = Math.min(demand(c), policy.get(c).guaranteedKbps);
        const give = Math.min(want, remaining);
        alloc.set(c, give);
        remaining -= give;
        if (give < want)
            unmet.push(c);
    }
    // 2. Weighted max-min fair water-filling for the remainder.
    let active = classes.filter((c) => alloc.get(c) < demand(c));
    while (remaining > 1e-9 && active.length > 0) {
        const totalWeight = active.reduce((s, c) => s + policy.get(c).weight, 0);
        let spent = 0;
        for (const c of active) {
            const share = remaining * policy.get(c).weight / totalWeight;
            const give = Math.min(share, demand(c) - alloc.get(c));
            alloc.set(c, alloc.get(c) + give);
            spent += give;
        }
        remaining -= spent;
        active = active.filter((c) => alloc.get(c) < demand(c) - 1e-9);
        if (spent < 1e-9)
            break;
    }
    const allocations = classes.map((c) => {
        const got = alloc.get(c);
        const asked = merged.get(c);
        const ceiling = policy.get(c).ceilingKbps;
        const satisfied = got >= asked - 1e-6;
        const limitedBy = satisfied ? (ceiling !== undefined && asked > ceiling ? 'ceiling' : 'demand') : ceiling !== undefined && got >= ceiling - 1e-6 ? 'ceiling' : 'capacity';
        return Object.freeze({ trafficClass: c, allocatedKbps: Math.round(got * 1000) / 1000, demandKbps: asked, satisfied: satisfied || limitedBy === 'ceiling' ? satisfied : false, limitedBy: satisfied && ceiling !== undefined && asked > ceiling ? 'ceiling' : limitedBy });
    });
    const total = allocations.reduce((s, a) => s + a.allocatedKbps, 0);
    return Object.freeze({ capacityKbps, allocations: Object.freeze(allocations), utilization: total / capacityKbps, oversubscribed: [...merged.values()].reduce((s, v) => s + v, 0) > capacityKbps, unmetGuarantees: Object.freeze(unmet) });
};
/** Compiles an allocation into mark + rate-limit rules for the data-plane abstraction. */
export const qosRules = (plan, owner, pathId, policies = DEFAULT_QOS_POLICIES, markBase = 0x100) => {
    const policy = new Map(policies.map((p) => [p.trafficClass, p]));
    const rules = [];
    for (const a of plan.allocations) {
        const p = policy.get(a.trafficClass);
        const mark = markBase + p.tier;
        rules.push({ id: `qos-mark-${pathId}-${a.trafficClass}`, priority: 100 + p.tier, owner, match: { mark: p.dscp }, action: { type: 'mark', mark } });
        if (a.limitedBy === 'ceiling' || (!a.satisfied && a.allocatedKbps > 0))
            rules.push({ id: `qos-limit-${pathId}-${a.trafficClass}`, priority: 200 + p.tier, owner, match: { mark }, action: { type: 'rate-limit', kbps: Math.max(1, Math.floor(a.allocatedKbps)) } });
    }
    return Object.freeze(rules);
};
//# sourceMappingURL=qos.js.map