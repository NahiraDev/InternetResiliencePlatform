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

const hourIn = (w: readonly [number, number], nowMs: number) => { const h = new Date(nowMs).getUTCHours(); return w[0] <= w[1] ? h >= w[0] && h < w[1] : h >= w[0] || h < w[1]; };
const capMatch = (patterns: readonly string[], cap: string) => patterns.some((p) => p === cap || (p.endsWith('.*') && cap.startsWith(p.slice(0, -1))));

const matches = (r: SecurityRule, c: SecurityRequestContext): boolean => {
  const w = r.when;
  if (w.boundaries && !w.boundaries.includes(c.boundary)) return false;
  if (w.capabilities && !capMatch(w.capabilities, c.capability)) return false;
  if (w.minRisk !== undefined && c.risk < w.minRisk) return false;
  if (w.requireUntrustedDevice && c.deviceTrusted) return false;
  if (w.modes && !w.modes.includes(c.mode)) return false;
  if (w.utcHours && !hourIn(w.utcHours, c.nowMs)) return false;
  return true;
};

export const DEFAULT_SECURITY_RULES: readonly SecurityRule[] = Object.freeze([
  { id: 'deny-untrusted-device-mutation', priority: 10, effect: 'deny', reason: 'device-not-enrolled', when: { capabilities: ['network.mutate', 'fabric.mutate', 'tunnel.mutate'], requireUntrustedDevice: true } },
  { id: 'deny-ai-mutation', priority: 11, effect: 'deny', reason: 'ai-advisory-only', when: { boundaries: ['ai'], capabilities: ['network.mutate', 'fabric.mutate', 'tunnel.mutate'] } },
  { id: 'approve-high-risk', priority: 20, effect: 'require-approval', reason: 'high-risk-requires-approval', when: { capabilities: ['network.mutate', 'fabric.mutate', 'tunnel.mutate'], minRisk: 0.7 } },
  { id: 'allow-read', priority: 90, effect: 'allow', reason: 'read-capability', when: { capabilities: ['observe.read', 'plan.propose'] } },
  { id: 'allow-runtime-mutation', priority: 91, effect: 'allow', reason: 'runtime-mutation', when: { boundaries: ['canonical-runtime', 'platform-adapter'], capabilities: ['network.mutate', 'fabric.mutate', 'tunnel.mutate'] } },
] as readonly SecurityRule[]);

export const evaluateSecurityPolicy = (rules: readonly SecurityRule[], ctx: SecurityRequestContext): SecurityEvaluation => {
  const ids = new Set<string>();
  for (const r of rules) { if (ids.has(r.id)) return Object.freeze({ effect: 'deny', reasons: Object.freeze([`fail-closed: duplicate rule id ${r.id}`]) }); ids.add(r.id); }
  for (const r of [...rules].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))) {
    if (!matches(r, ctx)) continue;
    if (r.effect === 'require-approval' && ctx.approved === true) continue;
    return Object.freeze({ effect: r.effect, ruleId: r.id, reasons: Object.freeze([r.reason]) });
  }
  return Object.freeze({ effect: 'deny', reasons: Object.freeze(['default-deny']) });
};

/**
 * Adapts an evaluation to the privileged boundary's `SecurityGateInput`, combining it with the
 * trust-boundary authorizer decision so both must pass.
 */
export const toSecurityGateInput = (evaluation: SecurityEvaluation, authorization: AuthorizationDecision): { readonly authorization: AuthorizationDecision; readonly reasons: readonly string[] } => {
  if (evaluation.effect === 'allow') return Object.freeze({ authorization, reasons: Object.freeze([...evaluation.reasons]) });
  const reason = evaluation.effect === 'require-approval' ? 'untrusted-boundary' : 'capability-denied';
  return Object.freeze({
    authorization: Object.freeze({ allowed: false, reason: authorization.allowed ? reason : (authorization.reason ?? reason), satisfied: Object.freeze([]), missing: Object.freeze([...authorization.missing]) }) as AuthorizationDecision,
    reasons: Object.freeze([`security-policy:${evaluation.effect}`, ...evaluation.reasons]),
  });
};
