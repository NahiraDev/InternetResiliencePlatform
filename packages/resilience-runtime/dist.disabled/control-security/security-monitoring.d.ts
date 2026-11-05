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
export interface SecurityEvent {
    readonly kind: SecurityEventKind;
    readonly subject: string;
    readonly deviceId?: string;
    readonly atMs: number;
}
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
export declare const DEFAULT_DETECTION_RULES: readonly DetectionRule[];
export interface ResponderOptions {
    readonly cooldownMs?: number;
    readonly maxResponsesPerWindow?: number;
    readonly budgetWindowMs?: number;
    readonly maxAuditRecords?: number;
}
export declare class SecurityMonitor {
    private readonly port;
    private readonly rules;
    private readonly events;
    private readonly lastResponse;
    private readonly responseTimes;
    private readonly audit;
    private readonly cooldownMs;
    private readonly maxPerWindow;
    private readonly budgetWindowMs;
    private readonly maxAudit;
    private sequence;
    constructor(port: SecurityContainmentPort, rules?: readonly DetectionRule[], options?: ResponderOptions);
    /** Ingests an event, evaluates detection rules and applies bounded containment. */
    ingest(event: SecurityEvent): Promise<readonly ResponseRecord[]>;
    private respond;
    auditTrail(): readonly ResponseRecord[];
}
//# sourceMappingURL=security-monitoring.d.ts.map