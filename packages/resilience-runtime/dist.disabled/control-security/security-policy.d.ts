/**
 * Phase 112 — Security Policy & Runtime Enforcement.
 *
 * Declarative, ordered security rules evaluated at runtime and adapted to the
 * existing `SecurityGateInput` of the privileged mutation boundary. Rules can
 * deny, require approval or allow; the default is deny. The evaluator is
 * additive to `TrustBoundaryAuthorizer` — a rule can never grant a capability
 * the authorizer's boundary ceiling forbids.
 */
import type { AuthorizationDecision, TrustBoundary } from '../security/trust-boundaries.js';
export type SecurityEffect = 'allow' | 'deny' | 'require-approval';
export interface SecurityRequestContext {
    readonly actorId: string;
    readonly boundary: TrustBoundary;
    readonly capability: string;
    readonly tenantId?: string;
    readonly resourceId?: string;
    readonly risk: number;
    readonly deviceTrusted: boolean;
    readonly mode: 'live' | 'simulation' | 'safe';
    readonly nowMs: number;
    readonly approved?: boolean;
}
export interface SecurityRule {
    readonly id: string;
    readonly priority: number;
    readonly effect: SecurityEffect;
    readonly reason: string;
    readonly when: {
        readonly boundaries?: readonly TrustBoundary[];
        readonly capabilities?: readonly string[];
        readonly minRisk?: number;
        readonly requireUntrustedDevice?: boolean;
        readonly modes?: readonly SecurityRequestContext['mode'][];
        readonly utcHours?: readonly [number, number];
    };
}
export interface SecurityEvaluation {
    readonly effect: SecurityEffect;
    readonly ruleId?: string;
    readonly reasons: readonly string[];
}
export declare const DEFAULT_SECURITY_RULES: readonly SecurityRule[];
export declare const evaluateSecurityPolicy: (rules: readonly SecurityRule[], ctx: SecurityRequestContext) => SecurityEvaluation;
/**
 * Adapts an evaluation to the privileged boundary's `SecurityGateInput`, combining it with the
 * trust-boundary authorizer decision so both must pass.
 */
export declare const toSecurityGateInput: (evaluation: SecurityEvaluation, authorization: AuthorizationDecision) => {
    readonly authorization: AuthorizationDecision;
    readonly reasons: readonly string[];
};
//# sourceMappingURL=security-policy.d.ts.map