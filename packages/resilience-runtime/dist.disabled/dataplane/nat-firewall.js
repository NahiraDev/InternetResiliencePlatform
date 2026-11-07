/**
 * Phase 133 — Advanced NAT / Firewall Policy Integration.
 *
 * A neutral NAT and firewall rule model with static analysis (shadowed rules,
 * contradictory duplicates), an ordered packet evaluator and — critically — a
 * lockout guard: no rule set may block the control-plane and management
 * flows that the runtime needs to keep itself recoverable. Output rules are
 * converted into the Phase 128 plan format for governed enforcement.
 */
import { cidrContains, cidrWithin, parseAddress, parseCidr } from './cidr.js';
/** Flows that must always remain reachable so the runtime and operators cannot be locked out. */
export const DEFAULT_PROTECTED_FLOWS = Object.freeze([
    { name: 'runtime-control-api', protocol: 'tcp', dstPort: 8443, direction: 'in' },
    { name: 'ssh-management', protocol: 'tcp', dstPort: 22, direction: 'in' },
    { name: 'dns-resolution', protocol: 'udp', dstPort: 53, direction: 'out' },
    { name: 'dns-resolution-tcp', protocol: 'tcp', dstPort: 53, direction: 'out' },
    { name: 'agent-control-channel', protocol: 'tcp', dstPort: 443, direction: 'out' },
]);
const ruleMatches = (r, p) => {
    if (r.direction && r.direction !== p.direction)
        return false;
    if (r.protocol && r.protocol !== p.protocol)
        return false;
    if (r.srcCidr && !cidrContains(parseCidr(r.srcCidr), parseAddress(p.src)))
        return false;
    if (r.dstCidr && !cidrContains(parseCidr(r.dstCidr), parseAddress(p.dst)))
        return false;
    if (r.dstPorts && (p.dstPort === undefined || p.dstPort < r.dstPorts[0] || p.dstPort > r.dstPorts[1]))
        return false;
    return true;
};
/** First-match evaluation in priority order; the default verdict is drop (fail closed). */
export const evaluatePacket = (rules, packet, defaultVerdict = 'drop') => {
    for (const r of [...rules].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))) {
        if (ruleMatches(r, packet))
            return Object.freeze({ verdict: r.verdict, ruleId: r.id, ...(r.nat ? { nat: r.nat } : {}) });
    }
    return Object.freeze({ verdict: defaultVerdict });
};
const covers = (outer, inner) => {
    if (outer.direction && outer.direction !== inner.direction)
        return false;
    if (outer.protocol && outer.protocol !== inner.protocol)
        return false;
    for (const k of ['srcCidr', 'dstCidr']) {
        const o = outer[k];
        const i = inner[k];
        if (o === undefined)
            continue;
        if (i === undefined || !cidrWithin(parseCidr(i), parseCidr(o)))
            return false;
    }
    if (outer.dstPorts) {
        if (!inner.dstPorts || inner.dstPorts[0] < outer.dstPorts[0] || inner.dstPorts[1] > outer.dstPorts[1])
            return false;
    }
    return true;
};
export const analyzeRules = (rules, protectedFlows = DEFAULT_PROTECTED_FLOWS) => {
    const invalid = [];
    for (const r of rules) {
        try {
            if (r.srcCidr)
                parseCidr(r.srcCidr);
            if (r.dstCidr)
                parseCidr(r.dstCidr);
            if (r.dstPorts && (r.dstPorts[0] > r.dstPorts[1] || r.dstPorts[0] < 0 || r.dstPorts[1] > 65_535))
                invalid.push(`${r.id}: invalid port range`);
            if (r.nat && r.nat.type !== 'none' && r.nat.type !== 'masquerade' && !r.nat.toAddress)
                invalid.push(`${r.id}: ${r.nat.type} requires toAddress`);
            if (r.nat?.toAddress)
                parseAddress(r.nat.toAddress);
        }
        catch (e) {
            invalid.push(`${r.id}: ${e.message}`);
        }
    }
    const bad = new Set(invalid.map((s) => s.split(':')[0]));
    const ok = rules.filter((r) => !bad.has(r.id)).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    const shadowed = [];
    const contradictions = [];
    for (let i = 0; i < ok.length; i += 1)
        for (let j = i + 1; j < ok.length; j += 1) {
            const a = ok[i];
            const b = ok[j];
            if (covers(a, b)) {
                shadowed.push({ rule: b.id, by: a.id });
                if (a.verdict !== b.verdict)
                    contradictions.push({ a: a.id, b: b.id });
            }
        }
    const lockouts = [];
    for (const f of protectedFlows) {
        // Probe with any-address packets; a protected flow must be accepted by the evaluator.
        const probeSrc = f.direction === 'in' ? '192.0.2.10' : '10.0.0.2';
        const probeDst = f.direction === 'in' ? '10.0.0.2' : '192.0.2.10';
        const ev = evaluatePacket(ok, { protocol: f.protocol, src: probeSrc, dst: probeDst, dstPort: f.dstPort, direction: f.direction });
        if (ev.verdict !== 'accept')
            lockouts.push(`${f.name}:${ev.ruleId ?? 'default-drop'}`);
    }
    return Object.freeze({ shadowed: Object.freeze(shadowed), contradictions: Object.freeze(contradictions), lockouts: Object.freeze(lockouts), invalid: Object.freeze(invalid) });
};
export class FirewallLockoutError extends Error {
    lockouts;
    constructor(lockouts) {
        super(`rule set would lock out protected flows: ${lockouts.join(', ')}`);
        this.lockouts = lockouts;
        this.name = 'FirewallLockoutError';
    }
}
/** Throws unless the rule set is valid and keeps every protected flow open. Contradictory shadowing is also refused. */
export const assertSafeRuleSet = (rules, protectedFlows = DEFAULT_PROTECTED_FLOWS) => {
    const a = analyzeRules(rules, protectedFlows);
    if (a.invalid.length)
        throw new Error(`invalid firewall rules: ${a.invalid.join('; ')}`);
    if (a.lockouts.length)
        throw new FirewallLockoutError(a.lockouts);
    if (a.contradictions.length)
        throw new Error(`contradictory shadowed rules: ${a.contradictions.map((c) => `${c.a}/${c.b}`).join(', ')}`);
    return a;
};
export const diffRuleSets = (current, desired) => {
    const cur = new Map(current.map((r) => [r.id, r]));
    const want = new Map(desired.map((r) => [r.id, r]));
    const add = desired.filter((r) => !cur.has(r.id)).sort((a, b) => a.id.localeCompare(b.id));
    const change = desired.filter((r) => cur.has(r.id) && JSON.stringify(cur.get(r.id)) !== JSON.stringify(r)).sort((a, b) => a.id.localeCompare(b.id));
    const remove = current.filter((r) => !want.has(r.id)).map((r) => r.id).sort();
    return Object.freeze({ add: Object.freeze(add), remove: Object.freeze(remove), change: Object.freeze(change) });
};
//# sourceMappingURL=nat-firewall.js.map