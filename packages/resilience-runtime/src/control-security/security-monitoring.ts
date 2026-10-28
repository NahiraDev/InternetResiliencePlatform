/**
 * Phase 113 — Security Monitoring & Automated Response.
 *
 * Detects control-plane abuse from security events (authentication failures,
 * replay attempts, capability denials, use of revoked identities) and requests
 * bounded containment through an injected port. Containment only changes
 * control-plane trust state (suspend a device, revoke grants); it can never
 * mutate the network. Responses are rate limited, cooled down and audited.
 */

export type SecurityEventKind = 'auth-failure' | 'replay-detected' | 'capability-denied' | 'revoked-identity-used' | 'bad-signature' | 'policy-denied';

export interface SecurityEvent { readonly kind: SecurityEventKind; readonly subject: string; readonly deviceId?: string; readonly atMs: number }

export type ResponseKind = 'suspend-device' | 'revoke-subject-grants' | 'raise-alert';

export interface SecurityFinding {
  readonly id: string;
  readonly rule: string;
  readonly subject: string;
  readonly deviceId?: string;
  readonly severity: 'warning' | 'critical';
  readonly count: number;
  readonly windowMs: number;
  readonly atMs: number;
}

export interface ResponseRecord {
  readonly findingId: string;
  readonly kind: ResponseKind;
  readonly subject: string;
  readonly status: 'applied' | 'suppressed-cooldown' | 'suppressed-budget' | 'failed';
  readonly detail?: string;
  readonly atMs: number;
}

/** Containment port. Implementations act on control-plane trust records only. */
export interface SecurityContainmentPort {
  suspendDevice(deviceId: string, reason: string, atMs: number): Promise<void> | void;
  revokeSubjectGrants(subject: string, reason: string, atMs: number): Promise<void> | void;
  raiseAlert(finding: SecurityFinding): Promise<void> | void;
}

export interface DetectionRule {
  readonly id: string;
  readonly kinds: readonly SecurityEventKind[];
  readonly threshold: number;
  readonly windowMs: number;
  readonly severity: 'warning' | 'critical';
  readonly response: readonly ResponseKind[];
  /** Immediate response on first occurrence (e.g. revoked identity use). */
  readonly immediate?: boolean;
}

export const DEFAULT_DETECTION_RULES: readonly DetectionRule[] = Object.freeze([
  { id: 'auth-failure-burst', kinds: ['auth-failure', 'bad-signature'], threshold: 5, windowMs: 60_000, severity: 'critical', response: ['suspend-device', 'raise-alert'] },
  { id: 'replay-attempts', kinds: ['replay-detected'], threshold: 3, windowMs: 120_000, severity: 'critical', response: ['suspend-device', 'raise-alert'] },
  { id: 'capability-probing', kinds: ['capability-denied', 'policy-denied'], threshold: 10, windowMs: 300_000, severity: 'warning', response: ['revoke-subject-grants', 'raise-alert'] },
  { id: 'revoked-identity-use', kinds: ['revoked-identity-used'], threshold: 1, windowMs: 60_000, severity: 'critical', response: ['raise-alert'], immediate: true },
] as readonly DetectionRule[]);

export interface ResponderOptions {
  readonly cooldownMs?: number;
  readonly maxResponsesPerWindow?: number;
  readonly budgetWindowMs?: number;
  readonly maxAuditRecords?: number;
}

export class SecurityMonitor {
  private readonly events: SecurityEvent[] = [];
  private readonly lastResponse = new Map<string, number>();
  private readonly responseTimes: number[] = [];
  private readonly audit: ResponseRecord[] = [];
  private readonly cooldownMs: number; private readonly maxPerWindow: number; private readonly budgetWindowMs: number; private readonly maxAudit: number;
  private sequence = 0;

  constructor(private readonly port: SecurityContainmentPort, private readonly rules: readonly DetectionRule[] = DEFAULT_DETECTION_RULES, options: ResponderOptions = {}) {
    this.cooldownMs = options.cooldownMs ?? 300_000;
    this.maxPerWindow = options.maxResponsesPerWindow ?? 20;
    this.budgetWindowMs = options.budgetWindowMs ?? 3_600_000;
    this.maxAudit = options.maxAuditRecords ?? 1_000;
  }

  /** Ingests an event, evaluates detection rules and applies bounded containment. */
  async ingest(event: SecurityEvent): Promise<readonly ResponseRecord[]> {
    this.events.push(event);
    const horizon = event.atMs - Math.max(...this.rules.map((r) => r.windowMs));
    while (this.events.length > 0 && (this.events[0] as SecurityEvent).atMs < horizon) this.events.shift();
    const out: ResponseRecord[] = [];
    for (const rule of this.rules) {
      if (!rule.kinds.includes(event.kind)) continue;
      const window = this.events.filter((e) => e.subject === event.subject && rule.kinds.includes(e.kind) && event.atMs - e.atMs <= rule.windowMs);
      if (window.length < rule.threshold) continue;
      const finding: SecurityFinding = Object.freeze({ id: `sec-${++this.sequence}`, rule: rule.id, subject: event.subject, ...(event.deviceId ? { deviceId: event.deviceId } : {}), severity: rule.severity, count: window.length, windowMs: rule.windowMs, atMs: event.atMs });
      for (const kind of rule.response) out.push(await this.respond(finding, kind));
    }
    return Object.freeze(out);
  }

  private async respond(f: SecurityFinding, kind: ResponseKind): Promise<ResponseRecord> {
    const key = `${f.rule}|${f.subject}|${kind}`;
    const rec = (status: ResponseRecord['status'], detail?: string): ResponseRecord => {
      const r = Object.freeze({ findingId: f.id, kind, subject: f.subject, status, ...(detail ? { detail } : {}), atMs: f.atMs });
      this.audit.push(r); while (this.audit.length > this.maxAudit) this.audit.shift();
      return r;
    };
    const last = this.lastResponse.get(key);
    if (last !== undefined && f.atMs - last < this.cooldownMs) return rec('suppressed-cooldown');
    while (this.responseTimes.length > 0 && f.atMs - (this.responseTimes[0] as number) > this.budgetWindowMs) this.responseTimes.shift();
    // Alerts are never budget-limited; containment actions are.
    if (kind !== 'raise-alert' && this.responseTimes.length >= this.maxPerWindow) return rec('suppressed-budget');
    try {
      if (kind === 'suspend-device') {
        if (!f.deviceId) return rec('failed', 'no-device-id');
        await this.port.suspendDevice(f.deviceId, f.rule, f.atMs);
      } else if (kind === 'revoke-subject-grants') await this.port.revokeSubjectGrants(f.subject, f.rule, f.atMs);
      else await this.port.raiseAlert(f);
    } catch (error) { return rec('failed', error instanceof Error ? error.message : 'containment-failed'); }
    this.lastResponse.set(key, f.atMs);
    if (kind !== 'raise-alert') this.responseTimes.push(f.atMs);
    return rec('applied');
  }

  auditTrail(): readonly ResponseRecord[] { return Object.freeze([...this.audit]); }
}
