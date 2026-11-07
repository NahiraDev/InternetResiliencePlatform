/**
 * Phase 133 — Advanced NAT / Firewall Policy Integration.
 *
 * A neutral NAT and firewall rule model with static analysis (shadowed rules,
 * contradictory duplicates), an ordered packet evaluator and — critically — a
 * lockout guard: no rule set may block the control-plane and management
 * flows that the runtime needs to keep itself recoverable. Output rules are
 * converted into the Phase 128 plan format for governed enforcement.
 */
export type FirewallVerdict = 'accept' | 'drop' | 'reject';
export type NatType = 'snat' | 'dnat' | 'masquerade' | 'none';
export interface PacketTuple {
    readonly protocol: 'tcp' | 'udp' | 'icmp';
    readonly src: string;
    readonly dst: string;
    readonly srcPort?: number;
    readonly dstPort?: number;
    readonly direction: 'in' | 'out' | 'forward';
}
export interface FirewallRule {
    readonly id: string;
    readonly priority: number;
    readonly direction?: PacketTuple['direction'];
    readonly protocol?: PacketTuple['protocol'];
    readonly srcCidr?: string;
    readonly dstCidr?: string;
    readonly dstPorts?: readonly [number, number];
    readonly verdict: FirewallVerdict;
    readonly nat?: {
        readonly type: NatType;
        readonly toAddress?: string;
        readonly toPort?: number;
    };
}
export interface ProtectedFlow {
    readonly name: string;
    readonly protocol: 'tcp' | 'udp';
    readonly dstPort: number;
    readonly direction: PacketTuple['direction'];
}
/** Flows that must always remain reachable so the runtime and operators cannot be locked out. */
export declare const DEFAULT_PROTECTED_FLOWS: readonly ProtectedFlow[];
export interface FirewallEvaluation {
    readonly verdict: FirewallVerdict;
    readonly ruleId?: string;
    readonly nat?: FirewallRule['nat'];
}
/** First-match evaluation in priority order; the default verdict is drop (fail closed). */
export declare const evaluatePacket: (rules: readonly FirewallRule[], packet: PacketTuple, defaultVerdict?: FirewallVerdict) => FirewallEvaluation;
export interface RuleAnalysis {
    readonly shadowed: readonly {
        readonly rule: string;
        readonly by: string;
    }[];
    readonly contradictions: readonly {
        readonly a: string;
        readonly b: string;
    }[];
    readonly lockouts: readonly string[];
    readonly invalid: readonly string[];
}
export declare const analyzeRules: (rules: readonly FirewallRule[], protectedFlows?: readonly ProtectedFlow[]) => RuleAnalysis;
export declare class FirewallLockoutError extends Error {
    readonly lockouts: readonly string[];
    constructor(lockouts: readonly string[]);
}
/** Throws unless the rule set is valid and keeps every protected flow open. Contradictory shadowing is also refused. */
export declare const assertSafeRuleSet: (rules: readonly FirewallRule[], protectedFlows?: readonly ProtectedFlow[]) => RuleAnalysis;
export interface RuleDiff {
    readonly add: readonly FirewallRule[];
    readonly remove: readonly string[];
    readonly change: readonly FirewallRule[];
}
export declare const diffRuleSets: (current: readonly FirewallRule[], desired: readonly FirewallRule[]) => RuleDiff;
//# sourceMappingURL=nat-firewall.d.ts.map