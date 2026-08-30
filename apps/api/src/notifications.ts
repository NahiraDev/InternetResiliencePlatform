import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { DatabaseClient } from '@irp/database';

export const incidentSeveritySchema = z.enum(['info', 'warning', 'critical']);
export const incidentStatusSchema = z.enum(['open', 'acknowledged', 'resolved']);
export const notificationTypeSchema = z.enum(['incident-opened', 'incident-updated', 'incident-resolved', 'action-required']);

export type IncidentSeverity = z.infer<typeof incidentSeveritySchema>;
export type IncidentStatus = z.infer<typeof incidentStatusSchema>;
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export interface IncidentRecord {
  id: string;
  fingerprint: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  source: string;
  classification: string;
  rootCause: string;
  affectedComponents: readonly string[];
  evidence: readonly string[];
  correlationReason: string;
  confidence: number;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  updatedAt: string;
}

export interface NotificationRecord {
  id: string;
  incidentId: string;
  type: NotificationType;
  severity: IncidentSeverity;
  title: string;
  message: string;
  actionable: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface RuntimeIncidentInput {
  id?: string;
  source?: string;
  classification: string;
  rootCause: string;
  affectedComponents: readonly string[];
  evidence: readonly string[];
  correlationReason: string;
  confidence: number;
}

const severityFor = (classification: string, confidence: number): IncidentSeverity => {
  if (classification === 'security_failure' || classification === 'policy_violation') return 'critical';
  if (classification === 'primary_failure' || classification === 'persistent_degradation') return 'warning';
  return confidence >= 0.9 ? 'warning' : 'info';
};

const fingerprintFor = (input: RuntimeIncidentInput): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        classification: input.classification,
        rootCause: input.rootCause,
        affectedComponents: [...input.affectedComponents].sort(),
      }),
    )
    .digest('hex');

const incidentId = (fingerprint: string) => `incident_${fingerprint.slice(0, 32)}`;
const notificationId = () => `notification_${crypto.randomUUID()}`;
const now = () => new Date().toISOString();

type IncidentRow = Omit<IncidentRecord, 'affectedComponents' | 'evidence'> & {
  affectedComponents: string[];
  evidence: string[];
};
type NotificationRow = NotificationRecord;

export class NotificationIncidentCenter {
  private readonly incidents = new Map<string, IncidentRecord>();
  private readonly notifications = new Map<string, NotificationRecord>();

  constructor(private readonly db?: DatabaseClient) {}

  async openFromRuntimeIncident(input: RuntimeIncidentInput): Promise<IncidentRecord> {
    const fingerprint = fingerprintFor(input);
    const severity = severityFor(input.classification, input.confidence);
    const current = await this.getByFingerprint(fingerprint);
    const timestamp = now();

    if (current) {
      const next: IncidentRecord = {
        ...current,
        severity: severity === 'critical' || current.severity === 'critical' ? 'critical' : severity === 'warning' || current.severity === 'warning' ? 'warning' : 'info',
        status: current.status === 'resolved' ? 'open' : current.status,
        occurrenceCount: current.occurrenceCount + 1,
        lastSeenAt: timestamp,
        updatedAt: timestamp,
        resolvedAt: current.status === 'resolved' ? null : current.resolvedAt,
        ...(input.confidence >= current.confidence ? {
          confidence: input.confidence,
          rootCause: input.rootCause,
          affectedComponents: input.affectedComponents,
          evidence: input.evidence,
          correlationReason: input.correlationReason,
          source: input.source ?? current.source,
        } : {}),
      };
      await this.persistIncident(next);
      await this.notify(next, current.status === 'resolved' ? 'incident-opened' : 'incident-updated');
      return next;
    }

    const created: IncidentRecord = {
      id: incidentId(fingerprint),
      fingerprint,
      title: input.rootCause,
      severity,
      status: 'open',
      source: input.source ?? 'resilience-runtime',
      classification: input.classification,
      rootCause: input.rootCause,
      affectedComponents: [...input.affectedComponents],
      evidence: [...input.evidence],
      correlationReason: input.correlationReason,
      confidence: input.confidence,
      occurrenceCount: 1,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      acknowledgedAt: null,
      resolvedAt: null,
      updatedAt: timestamp,
    };
    await this.persistIncident(created);
    await this.notify(created, 'incident-opened');
    return created;
  }

  async acknowledge(id: string): Promise<IncidentRecord | null> {
    const current = await this.get(id);
    if (!current || current.status === 'resolved') return current;
    const updated = { ...current, status: 'acknowledged' as const, acknowledgedAt: now(), updatedAt: now() };
    await this.persistIncident(updated);
    await this.notify(updated, 'incident-updated');
    return updated;
  }

  async resolve(id: string): Promise<IncidentRecord | null> {
    const current = await this.get(id);
    if (!current) return null;
    if (current.status === 'resolved') return current;
    const updated = { ...current, status: 'resolved' as const, resolvedAt: now(), updatedAt: now() };
    await this.persistIncident(updated);
    await this.notify(updated, 'incident-resolved');
    return updated;
  }

  async listIncidents(limit = 100, status?: IncidentStatus): Promise<readonly IncidentRecord[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    if (this.db) {
      const rows = (await this.db.$queryRaw`
        SELECT id::text AS "id", fingerprint, title, severity, status, source,
               classification, "rootCause", "affectedComponents", evidence,
               "correlationReason", confidence, "occurrenceCount",
               "firstSeenAt", "lastSeenAt", "acknowledgedAt", "resolvedAt", "updatedAt"
        FROM "Incident"
        WHERE ${status ? this.dbCondition(status) : this.dbConditionAll()}
        ORDER BY "lastSeenAt" DESC
        LIMIT ${boundedLimit}
      `) as unknown as IncidentRow[];
      return rows.map((row) => ({ ...row, firstSeenAt: new Date(row.firstSeenAt).toISOString(), lastSeenAt: new Date(row.lastSeenAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString(), acknowledgedAt: row.acknowledgedAt ? new Date(row.acknowledgedAt).toISOString() : null, resolvedAt: row.resolvedAt ? new Date(row.resolvedAt).toISOString() : null }));
    }
    return [...this.incidents.values()]
      .filter((item) => !status || item.status === status)
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
      .slice(0, boundedLimit);
  }

  async get(id: string): Promise<IncidentRecord | null> {
    if (this.db) {
      const rows = (await this.db.$queryRaw`
        SELECT id::text AS "id", fingerprint, title, severity, status, source,
               classification, "rootCause", "affectedComponents", evidence,
               "correlationReason", confidence, "occurrenceCount",
               "firstSeenAt", "lastSeenAt", "acknowledgedAt", "resolvedAt", "updatedAt"
        FROM "Incident" WHERE id = CAST(${id} AS uuid) LIMIT 1
      `) as unknown as IncidentRow[];
      const row = rows[0];
      if (!row) return null;
      return { ...row, firstSeenAt: new Date(row.firstSeenAt).toISOString(), lastSeenAt: new Date(row.lastSeenAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString(), acknowledgedAt: row.acknowledgedAt ? new Date(row.acknowledgedAt).toISOString() : null, resolvedAt: row.resolvedAt ? new Date(row.resolvedAt).toISOString() : null };
    }
    return this.incidents.get(id) ?? null;
  }

  async getByFingerprint(fingerprint: string): Promise<IncidentRecord | null> {
    if (this.db) {
      const rows = (await this.db.$queryRaw`
        SELECT id::text AS "id", fingerprint, title, severity, status, source,
               classification, "rootCause", "affectedComponents", evidence,
               "correlationReason", confidence, "occurrenceCount",
               "firstSeenAt", "lastSeenAt", "acknowledgedAt", "resolvedAt", "updatedAt"
        FROM "Incident" WHERE fingerprint = ${fingerprint} LIMIT 1
      `) as unknown as IncidentRow[];
      const row = rows[0];
      if (!row) return null;
      return { ...row, firstSeenAt: new Date(row.firstSeenAt).toISOString(), lastSeenAt: new Date(row.lastSeenAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString(), acknowledgedAt: row.acknowledgedAt ? new Date(row.acknowledgedAt).toISOString() : null, resolvedAt: row.resolvedAt ? new Date(row.resolvedAt).toISOString() : null };
    }
    return [...this.incidents.values()].find((item) => item.fingerprint === fingerprint) ?? null;
  }

  async listNotifications(limit = 100, unreadOnly = false): Promise<readonly NotificationRecord[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    if (this.db) {
      const rows = (await this.db.$queryRaw`
        SELECT id::text AS "id", "incidentId"::text AS "incidentId", type, severity,
               title, message, actionable, "readAt", "createdAt"
        FROM "Notification"
        WHERE ${unreadOnly ? this.dbUnreadCondition() : this.dbConditionAll()}
        ORDER BY "createdAt" DESC LIMIT ${boundedLimit}
      `) as unknown as NotificationRow[];
      return rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt).toISOString(), readAt: row.readAt ? new Date(row.readAt).toISOString() : null }));
    }
    return [...this.notifications.values()]
      .filter((item) => !unreadOnly || !item.readAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, boundedLimit);
  }

  async markRead(id: string): Promise<NotificationRecord | null> {
    const current = this.notifications.get(id);
    if (!this.db && !current) return null;
    if (this.db) {
      const rows = (await this.db.$queryRaw`
        UPDATE "Notification" SET "readAt" = NOW() WHERE id = CAST(${id} AS uuid)
        RETURNING id::text AS "id", "incidentId"::text AS "incidentId", type, severity,
                  title, message, actionable, "readAt", "createdAt"
      `) as unknown as NotificationRow[];
      const row = rows[0];
      return row ? { ...row, createdAt: new Date(row.createdAt).toISOString(), readAt: row.readAt ? new Date(row.readAt).toISOString() : null } : null;
    }
    const updated = { ...current, readAt: now() };
    this.notifications.set(id, updated);
    return updated;
  }

  private async persistIncident(incident: IncidentRecord): Promise<void> {
    this.incidents.set(incident.id, incident);
    if (!this.db) return;
    await this.db.$queryRaw`
      INSERT INTO "Incident"
        (id, fingerprint, title, severity, status, source, classification, "rootCause",
         "affectedComponents", evidence, "correlationReason", confidence, "occurrenceCount",
         "firstSeenAt", "lastSeenAt", "acknowledgedAt", "resolvedAt", "updatedAt")
      VALUES
        (CAST(${incident.id.replace('incident_', '')} AS uuid), ${incident.fingerprint}, ${incident.title},
         ${incident.severity}, ${incident.status}, ${incident.source}, ${incident.classification},
         ${incident.rootCause}, CAST(${JSON.stringify(incident.affectedComponents)} AS jsonb),
         CAST(${JSON.stringify(incident.evidence)} AS jsonb), ${incident.correlationReason}, ${incident.confidence},
         ${incident.occurrenceCount}, CAST(${incident.firstSeenAt} AS timestamptz), CAST(${incident.lastSeenAt} AS timestamptz),
         ${incident.acknowledgedAt ? `CAST(${incident.acknowledgedAt} AS timestamptz)` : null},
         ${incident.resolvedAt ? `CAST(${incident.resolvedAt} AS timestamptz)` : null}, NOW())
      ON CONFLICT (fingerprint) DO UPDATE SET
        title = EXCLUDED.title,
        severity = EXCLUDED.severity,
        status = EXCLUDED.status,
        source = EXCLUDED.source,
        classification = EXCLUDED.classification,
        "rootCause" = EXCLUDED."rootCause",
        "affectedComponents" = EXCLUDED."affectedComponents",
        evidence = EXCLUDED.evidence,
        "correlationReason" = EXCLUDED."correlationReason",
        confidence = EXCLUDED.confidence,
        "occurrenceCount" = EXCLUDED."occurrenceCount",
        "lastSeenAt" = EXCLUDED."lastSeenAt",
        "acknowledgedAt" = EXCLUDED."acknowledgedAt",
        "resolvedAt" = EXCLUDED."resolvedAt",
        "updatedAt" = NOW()
    `;
  }

  private async notify(incident: IncidentRecord, type: NotificationType): Promise<void> {
    const actionable = incident.severity !== 'info' && incident.status !== 'resolved';
    const notification: NotificationRecord = {
      id: notificationId(),
      incidentId: incident.id,
      type,
      severity: incident.severity,
      title: type === 'incident-resolved' ? `Recovered: ${incident.title}` : incident.title,
      message: type === 'incident-resolved'
        ? `Incident resolved after ${incident.occurrenceCount} observed occurrence(s).`
        : `${incident.classification}: ${incident.rootCause}. ${incident.correlationReason}`,
      actionable,
      readAt: null,
      createdAt: now(),
    };
    this.notifications.set(notification.id, notification);
    if (!this.db) return;
    await this.db.$queryRaw`
      INSERT INTO "Notification" (id, "incidentId", type, severity, title, message, actionable, "readAt", "createdAt")
      VALUES (CAST(${notification.id.replace('notification_', '')} AS uuid), CAST(${incident.id.replace('incident_', '')} AS uuid),
              ${notification.type}, ${notification.severity}, ${notification.title}, ${notification.message},
              ${notification.actionable}, NULL, NOW())
    `;
  }

  private dbCondition(status: IncidentStatus) {
    return this.dbLiteral(`status = '${status}'`);
  }

  private dbUnreadCondition() {
    return this.dbLiteral('"readAt" IS NULL');
  }

  private dbConditionAll() {
    return this.dbLiteral('TRUE');
  }

  private dbLiteral(value: string) {
    return { __unsafeSql: value };
  }
}

export const notificationsStatusSchema = z.object({
  status: incidentStatusSchema.optional(),
  unreadOnly: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});
