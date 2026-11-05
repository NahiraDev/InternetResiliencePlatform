/**
 * Phase 113 — Security Monitoring & Automated Response.
 *
 * Detects control-plane abuse from security events (authentication failures,
 * replay attempts, capability denials, use of revoked identities) and requests
 * bounded containment through an injected port. Containment only changes
 * control-plane trust state (suspend a device, revoke grants); it can never
 * mutate the network. Responses are rate limited, cooled down and audited.
 */
export const DEFAULT_DETECTION_RULES = Object.freeze([
    { id: 'auth-failure-burst', kinds: ['auth-failure', 'bad-signature'], threshold: 5, windowMs: 60_000, severity: 'critical', response: ['suspend-device', 'raise-alert'] },
    { id: 'replay-attempts', kinds: ['replay-detected'], threshold: 3, windowMs: 120_000, severity: 'critical', response: ['suspend-device', 'raise-alert'] },
    { id: 'capability-probing', kinds: ['capability-denied', 'policy-denied'], threshold: 10, windowMs: 300_000, severity: 'warning', response: ['revoke-subject-grants', 'raise-alert'] },
    { id: 'revoked-identity-use', kinds: ['revoked-identity-used'], threshold: 1, windowMs: 60_000, severity: 'critical', response: ['raise-alert'], immediate: true },
]);
export class SecurityMonitor {
    port;
    rules;
    events = [];
    lastResponse = new Map();
    responseTimes = [];
    audit = [];
    cooldownMs;
    maxPerWindow;
    budgetWindowMs;
    maxAudit;
    sequence = 0;
    constructor(port, rules = DEFAULT_DETECTION_RULES, options = {}) {
        this.port = port;
        this.rules = rules;
        this.cooldownMs = options.cooldownMs ?? 300_000;
        this.maxPerWindow = options.maxResponsesPerWindow ?? 20;
        this.budgetWindowMs = options.budgetWindowMs ?? 3_600_000;
        this.maxAudit = options.maxAuditRecords ?? 1_000;
    }
    /** Ingests an event, evaluates detection rules and applies bounded containment. */
    async ingest(event) {
        this.events.push(event);
        const horizon = event.atMs - Math.max(...this.rules.map((r) => r.windowMs));
        while (this.events.length > 0 && this.events[0].atMs < horizon)
            this.events.shift();
        const out = [];
        for (const rule of this.rules) {
            if (!rule.kinds.includes(event.kind))
                continue;
            const window = this.events.filter((e) => e.subject === event.subject && rule.kinds.includes(e.kind) && event.atMs - e.atMs <= rule.windowMs);
            if (window.length < rule.threshold)
                continue;
            const finding = Object.freeze({ id: `sec-${++this.sequence}`, rule: rule.id, subject: event.subject, ...(event.deviceId ? { deviceId: event.deviceId } : {}), severity: rule.severity, count: window.length, windowMs: rule.windowMs, atMs: event.atMs });
            for (const kind of rule.response)
                out.push(await this.respond(finding, kind));
        }
        return Object.freeze(out);
    }
    async respond(f, kind) {
        const key = `${f.rule}|${f.subject}|${kind}`;
        const rec = (status, detail) => {
            const r = Object.freeze({ findingId: f.id, kind, subject: f.subject, status, ...(detail ? { detail } : {}), atMs: f.atMs });
            this.audit.push(r);
            while (this.audit.length > this.maxAudit)
                this.audit.shift();
            return r;
        };
        const last = this.lastResponse.get(key);
        if (last !== undefined && f.atMs - last < this.cooldownMs)
            return rec('suppressed-cooldown');
        while (this.responseTimes.length > 0 && f.atMs - this.responseTimes[0] > this.budgetWindowMs)
            this.responseTimes.shift();
        // Alerts are never budget-limited; containment actions are.
        if (kind !== 'raise-alert' && this.responseTimes.length >= this.maxPerWindow)
            return rec('suppressed-budget');
        try {
            if (kind === 'suspend-device') {
                if (!f.deviceId)
                    return rec('failed', 'no-device-id');
                await this.port.suspendDevice(f.deviceId, f.rule, f.atMs);
            }
            else if (kind === 'revoke-subject-grants')
                await this.port.revokeSubjectGrants(f.subject, f.rule, f.atMs);
            else
                await this.port.raiseAlert(f);
        }
        catch (error) {
            return rec('failed', error instanceof Error ? error.message : 'containment-failed');
        }
        this.lastResponse.set(key, f.atMs);
        if (kind !== 'raise-alert')
            this.responseTimes.push(f.atMs);
        return rec('applied');
    }
    auditTrail() { return Object.freeze([...this.audit]); }
}
//# sourceMappingURL=security-monitoring.js.map