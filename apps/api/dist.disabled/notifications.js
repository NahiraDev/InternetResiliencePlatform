import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
export const incidentSeveritySchema = z.enum(['info', 'warning', 'critical']);
export const incidentStatusSchema = z.enum(['open', 'acknowledged', 'resolved']);
export const notificationTypeSchema = z.enum([
    'incident-opened',
    'incident-updated',
    'incident-resolved',
    'action-required',
]);
export const runtimeIncidentInputSchema = z.object({
    source: z.string().trim().min(1).max(128).optional(),
    classification: z.string().trim().min(1).max(128),
    rootCause: z.string().trim().min(1).max(512),
    affectedComponents: z.array(z.string().trim().min(1).max(128)).max(32),
    evidence: z.array(z.string().trim().min(1).max(2048)).max(64),
    correlationReason: z.string().trim().min(1).max(2048),
    confidence: z.number().finite().min(0).max(1),
});
const severityFor = (classification, confidence) => {
    if (classification === 'security_failure' || classification === 'policy_violation')
        return 'critical';
    if (classification === 'primary_failure' || classification === 'persistent_degradation')
        return 'warning';
    return confidence >= 0.9 ? 'warning' : 'info';
};
const fingerprintFor = (input) => createHash('sha256')
    .update(JSON.stringify({
    classification: input.classification,
    rootCause: input.rootCause,
    affectedComponents: [...input.affectedComponents].sort(),
}))
    .digest('hex');
const iso = (value) => new Date(String(value)).toISOString();
const now = () => new Date().toISOString();
const mapIncident = (row) => ({
    ...row,
    affectedComponents: [...row.affectedComponents],
    evidence: [...row.evidence],
    firstSeenAt: iso(row.firstSeenAt),
    lastSeenAt: iso(row.lastSeenAt),
    acknowledgedAt: row.acknowledgedAt ? iso(row.acknowledgedAt) : null,
    resolvedAt: row.resolvedAt ? iso(row.resolvedAt) : null,
    updatedAt: iso(row.updatedAt),
});
const mapNotification = (row) => ({
    ...row,
    createdAt: iso(row.createdAt),
    readAt: row.readAt ? iso(row.readAt) : null,
});
export class NotificationIncidentCenter {
    db;
    memoryIncidents = new Map();
    memoryNotifications = new Map();
    constructor(db) {
        this.db = db;
    }
    async open(input) {
        const validated = runtimeIncidentInputSchema.parse(input);
        const fingerprint = fingerprintFor(validated);
        const current = await this.getByFingerprint(fingerprint);
        const timestamp = now();
        const severity = severityFor(validated.classification, validated.confidence);
        const incident = current
            ? {
                ...current,
                title: validated.rootCause,
                severity: current.severity === 'critical' || severity === 'critical'
                    ? 'critical'
                    : current.severity === 'warning' || severity === 'warning'
                        ? 'warning'
                        : 'info',
                status: current.status === 'resolved' ? 'open' : current.status,
                rootCause: validated.rootCause,
                affectedComponents: [...validated.affectedComponents],
                evidence: [...validated.evidence],
                correlationReason: validated.correlationReason,
                confidence: Math.max(current.confidence, validated.confidence),
                source: validated.source ?? current.source,
                occurrenceCount: current.occurrenceCount + 1,
                lastSeenAt: timestamp,
                acknowledgedAt: current.status === 'resolved' ? null : current.acknowledgedAt,
                resolvedAt: current.status === 'resolved' ? null : current.resolvedAt,
                updatedAt: timestamp,
            }
            : {
                id: randomUUID(),
                fingerprint,
                title: validated.rootCause,
                severity,
                status: 'open',
                source: validated.source ?? 'resilience-runtime',
                classification: validated.classification,
                rootCause: validated.rootCause,
                affectedComponents: [...validated.affectedComponents],
                evidence: [...validated.evidence],
                correlationReason: validated.correlationReason,
                confidence: validated.confidence,
                occurrenceCount: 1,
                firstSeenAt: timestamp,
                lastSeenAt: timestamp,
                acknowledgedAt: null,
                resolvedAt: null,
                updatedAt: timestamp,
            };
        await this.persistIncident(incident);
        await this.emitNotification(incident, !current
            ? 'incident-opened'
            : current.status === 'resolved'
                ? 'incident-opened'
                : 'incident-updated');
        return incident;
    }
    async acknowledge(id) {
        const current = await this.get(id);
        if (!current || current.status === 'resolved')
            return current;
        const timestamp = now();
        const updated = {
            ...current,
            status: 'acknowledged',
            acknowledgedAt: timestamp,
            updatedAt: timestamp,
        };
        await this.persistIncident(updated);
        await this.emitNotification(updated, 'incident-updated');
        return updated;
    }
    async resolve(id) {
        const current = await this.get(id);
        if (!current || current.status === 'resolved')
            return current;
        const timestamp = now();
        const updated = {
            ...current,
            status: 'resolved',
            resolvedAt: timestamp,
            updatedAt: timestamp,
        };
        await this.persistIncident(updated);
        await this.emitNotification(updated, 'incident-resolved');
        return updated;
    }
    async get(id) {
        if (!this.db)
            return this.memoryIncidents.get(id) ?? null;
        const rows = (await this.db.$queryRaw `
      SELECT id::text AS "id", fingerprint, title, severity, status, source, classification,
             "rootCause", "affectedComponents", evidence, "correlationReason", confidence,
             "occurrenceCount", "firstSeenAt", "lastSeenAt", "acknowledgedAt", "resolvedAt", "updatedAt"
      FROM "Incident" WHERE id = CAST(${id} AS uuid) LIMIT 1
    `);
        return rows[0] ? mapIncident(rows[0]) : null;
    }
    async getByFingerprint(fingerprint) {
        if (!this.db)
            return ([...this.memoryIncidents.values()].find((item) => item.fingerprint === fingerprint) ?? null);
        const rows = (await this.db.$queryRaw `
      SELECT id::text AS "id", fingerprint, title, severity, status, source, classification,
             "rootCause", "affectedComponents", evidence, "correlationReason", confidence,
             "occurrenceCount", "firstSeenAt", "lastSeenAt", "acknowledgedAt", "resolvedAt", "updatedAt"
      FROM "Incident" WHERE fingerprint = ${fingerprint} LIMIT 1
    `);
        return rows[0] ? mapIncident(rows[0]) : null;
    }
    async listIncidents(limit = 100, status) {
        const bounded = Math.min(Math.max(limit, 1), 100);
        if (!this.db) {
            return [...this.memoryIncidents.values()]
                .filter((item) => !status || item.status === status)
                .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
                .slice(0, bounded);
        }
        const rows = (status
            ? await this.db.$queryRaw `
          SELECT id::text AS "id", fingerprint, title, severity, status, source, classification,
                 "rootCause", "affectedComponents", evidence, "correlationReason", confidence,
                 "occurrenceCount", "firstSeenAt", "lastSeenAt", "acknowledgedAt", "resolvedAt", "updatedAt"
          FROM "Incident" WHERE status = ${status} ORDER BY "lastSeenAt" DESC LIMIT ${bounded}
        `
            : await this.db.$queryRaw `
          SELECT id::text AS "id", fingerprint, title, severity, status, source, classification,
                 "rootCause", "affectedComponents", evidence, "correlationReason", confidence,
                 "occurrenceCount", "firstSeenAt", "lastSeenAt", "acknowledgedAt", "resolvedAt", "updatedAt"
          FROM "Incident" ORDER BY "lastSeenAt" DESC LIMIT ${bounded}
        `);
        return rows.map(mapIncident);
    }
    async listNotifications(limit = 100, unreadOnly = false) {
        const bounded = Math.min(Math.max(limit, 1), 100);
        if (!this.db) {
            return [...this.memoryNotifications.values()]
                .filter((item) => !unreadOnly || item.readAt === null)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, bounded);
        }
        const rows = (unreadOnly
            ? await this.db.$queryRaw `
          SELECT id::text AS "id", "incidentId"::text AS "incidentId", type, severity,
                 title, message, actionable, "readAt", "createdAt"
          FROM "Notification" WHERE "readAt" IS NULL ORDER BY "createdAt" DESC LIMIT ${bounded}
        `
            : await this.db.$queryRaw `
          SELECT id::text AS "id", "incidentId"::text AS "incidentId", type, severity,
                 title, message, actionable, "readAt", "createdAt"
          FROM "Notification" ORDER BY "createdAt" DESC LIMIT ${bounded}
        `);
        return rows.map(mapNotification);
    }
    async markRead(id) {
        if (!this.db) {
            const current = this.memoryNotifications.get(id);
            if (!current)
                return null;
            if (current.readAt)
                return current;
            const updated = { ...current, readAt: now() };
            this.memoryNotifications.set(id, updated);
            return updated;
        }
        const rows = (await this.db.$queryRaw `
      UPDATE "Notification" SET "readAt" = COALESCE("readAt", NOW()) WHERE id = CAST(${id} AS uuid)
      RETURNING id::text AS "id", "incidentId"::text AS "incidentId", type, severity,
                title, message, actionable, "readAt", "createdAt"
    `);
        return rows[0] ? mapNotification(rows[0]) : null;
    }
    async persistIncident(incident) {
        this.memoryIncidents.set(incident.id, incident);
        if (!this.db)
            return;
        await this.db.$queryRaw `
      INSERT INTO "Incident" (id, fingerprint, title, severity, status, source, classification,
        "rootCause", "affectedComponents", evidence, "correlationReason", confidence, "occurrenceCount",
        "firstSeenAt", "lastSeenAt", "acknowledgedAt", "resolvedAt", "updatedAt")
      VALUES (${incident.id}::uuid, ${incident.fingerprint}, ${incident.title}, ${incident.severity}, ${incident.status},
        ${incident.source}, ${incident.classification}, ${incident.rootCause},
        ${JSON.stringify(incident.affectedComponents)}::jsonb, ${JSON.stringify(incident.evidence)}::jsonb,
        ${incident.correlationReason}, ${incident.confidence}, ${incident.occurrenceCount},
        ${incident.firstSeenAt}::timestamptz, ${incident.lastSeenAt}::timestamptz,
        ${incident.acknowledgedAt}::timestamptz, ${incident.resolvedAt}::timestamptz, NOW())
      ON CONFLICT (fingerprint) DO UPDATE SET
        title = EXCLUDED.title, severity = EXCLUDED.severity, status = EXCLUDED.status,
        source = EXCLUDED.source, classification = EXCLUDED.classification, "rootCause" = EXCLUDED."rootCause",
        "affectedComponents" = EXCLUDED."affectedComponents", evidence = EXCLUDED.evidence,
        "correlationReason" = EXCLUDED."correlationReason", confidence = EXCLUDED.confidence,
        "occurrenceCount" = EXCLUDED."occurrenceCount", "lastSeenAt" = EXCLUDED."lastSeenAt",
        "acknowledgedAt" = EXCLUDED."acknowledgedAt", "resolvedAt" = EXCLUDED."resolvedAt", updatedAt = NOW()
    `;
    }
    async emitNotification(incident, type) {
        const notification = {
            id: randomUUID(),
            incidentId: incident.id,
            type,
            severity: incident.severity,
            title: type === 'incident-resolved' ? `Recovered: ${incident.title}` : incident.title,
            message: type === 'incident-resolved'
                ? `Incident resolved after ${incident.occurrenceCount} observed occurrence(s).`
                : `${incident.classification}: ${incident.rootCause}. ${incident.correlationReason}`,
            actionable: incident.severity !== 'info' && incident.status !== 'resolved',
            readAt: null,
            createdAt: now(),
        };
        this.memoryNotifications.set(notification.id, notification);
        if (!this.db)
            return;
        await this.db.$queryRaw `
      INSERT INTO "Notification" (id, "incidentId", type, severity, title, message, actionable, "readAt", "createdAt")
      VALUES (${notification.id}::uuid, ${notification.incidentId}::uuid, ${notification.type}, ${notification.severity},
              ${notification.title}, ${notification.message}, ${notification.actionable}, NULL, NOW())
    `;
    }
}
export const notificationsStatusSchema = z.object({
    status: incidentStatusSchema.optional(),
    unreadOnly: z.coerce.boolean().default(false),
    limit: z.coerce.number().int().min(1).max(100).default(100),
});
//# sourceMappingURL=notifications.js.map