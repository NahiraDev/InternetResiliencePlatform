/**
 * Phase 144 — Privacy/Security Governance Controls.
 *
 * Executable governance rules over access grants and data use: purpose
 * limitation, separation of duties, stale-access review, break-glass expiry
 * and least privilege. Each control returns structured findings with severity,
 * so results can feed the compliance evidence framework.
 */
const f = (control, severity, subject, message) => ({ control, severity, subject, message });
export const checkSeparationOfDuties = (grants, policy, nowMs) => {
    const live = grants.filter((g) => g.expiresAtMs === undefined || g.expiresAtMs > nowMs);
    const out = [];
    for (const actor of [...new Set(live.map((g) => g.actor))].sort()) {
        const caps = new Set(live.filter((g) => g.actor === actor).map((g) => g.capability));
        for (const [a, b] of policy.conflictingCapabilities)
            if (caps.has(a) && caps.has(b))
                out.push(f('separation-of-duties', 'high', actor, `holds conflicting capabilities ${a} and ${b}`));
    }
    return Object.freeze(out);
};
export const checkPurposeLimitation = (uses, policy) => Object.freeze(uses.filter((u) => !policy.allowedPurposes[u.dataClass].includes(u.purpose)).map((u) => f('purpose-limitation', u.dataClass === 'restricted' ? 'critical' : 'high', u.actor, `used ${u.dataClass} data for disallowed purpose "${u.purpose}"`)));
export const checkAccessReview = (grants, policy, nowMs) => {
    const out = [];
    for (const g of grants) {
        if (g.expiresAtMs !== undefined && g.expiresAtMs <= nowMs)
            continue;
        const idle = nowMs - (g.lastUsedAtMs ?? g.grantedAtMs);
        if (idle > policy.staleAfterMs)
            out.push(f('stale-access', 'medium', g.actor, `capability ${g.capability} unused for ${Math.floor(idle / 86_400_000)} days`));
        if (g.breakGlass) {
            if (g.expiresAtMs === undefined)
                out.push(f('break-glass', 'critical', g.actor, `break-glass ${g.capability} has no expiry`));
            else if (g.expiresAtMs - g.grantedAtMs > policy.maxBreakGlassMs)
                out.push(f('break-glass', 'high', g.actor, `break-glass ${g.capability} exceeds the maximum duration`));
        }
    }
    return Object.freeze(out);
};
export const checkLeastPrivilege = (grants, policy, nowMs) => {
    const counts = new Map();
    for (const g of grants)
        if (g.expiresAtMs === undefined || g.expiresAtMs > nowMs)
            counts.set(g.actor, (counts.get(g.actor) ?? 0) + 1);
    return Object.freeze([...counts].filter(([, n]) => n > policy.maxGrantsPerActor).sort(([a], [b]) => a.localeCompare(b)).map(([a, n]) => f('least-privilege', 'medium', a, `${n} live grants exceed the limit of ${policy.maxGrantsPerActor}`)));
};
export const runGovernanceReview = (grants, uses, policy, nowMs) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    const findings = [...checkSeparationOfDuties(grants, policy, nowMs), ...checkPurposeLimitation(uses, policy), ...checkAccessReview(grants, policy, nowMs), ...checkLeastPrivilege(grants, policy, nowMs)]
        .sort((a, b) => order[a.severity] - order[b.severity] || a.control.localeCompare(b.control) || a.subject.localeCompare(b.subject));
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const x of findings)
        bySeverity[x.severity] += 1;
    return Object.freeze({ findings: Object.freeze(findings), bySeverity: Object.freeze(bySeverity), pass: bySeverity.critical === 0 && bySeverity.high === 0 });
};
//# sourceMappingURL=governance-controls.js.map