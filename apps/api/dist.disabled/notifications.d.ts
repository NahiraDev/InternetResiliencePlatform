import { z } from 'zod';
import type { DatabaseClient } from '@irp/database';
export declare const incidentSeveritySchema: z.ZodEnum<{
    warning: "warning";
    info: "info";
    critical: "critical";
}>;
export declare const incidentStatusSchema: z.ZodEnum<{
    open: "open";
    acknowledged: "acknowledged";
    resolved: "resolved";
}>;
export declare const notificationTypeSchema: z.ZodEnum<{
    "incident-opened": "incident-opened";
    "incident-updated": "incident-updated";
    "incident-resolved": "incident-resolved";
    "action-required": "action-required";
}>;
export type IncidentSeverity = z.infer<typeof incidentSeveritySchema>;
export type IncidentStatus = z.infer<typeof incidentStatusSchema>;
export type NotificationType = z.infer<typeof notificationTypeSchema>;
export declare const runtimeIncidentInputSchema: z.ZodObject<{
    source: z.ZodOptional<z.ZodString>;
    classification: z.ZodString;
    rootCause: z.ZodString;
    affectedComponents: z.ZodArray<z.ZodString>;
    evidence: z.ZodArray<z.ZodString>;
    correlationReason: z.ZodString;
    confidence: z.ZodNumber;
}, z.core.$strip>;
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
    acknowledgedAt: string | null;
    resolvedAt: string | null;
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
    readAt: string | null;
    createdAt: string;
}
export type RuntimeIncidentInput = z.infer<typeof runtimeIncidentInputSchema>;
export declare class NotificationIncidentCenter {
    private readonly db?;
    private readonly memoryIncidents;
    private readonly memoryNotifications;
    constructor(db?: DatabaseClient | undefined);
    open(input: RuntimeIncidentInput): Promise<IncidentRecord>;
    acknowledge(id: string): Promise<IncidentRecord | null>;
    resolve(id: string): Promise<IncidentRecord | null>;
    get(id: string): Promise<IncidentRecord | null>;
    getByFingerprint(fingerprint: string): Promise<IncidentRecord | null>;
    listIncidents(limit?: number, status?: IncidentStatus): Promise<readonly IncidentRecord[]>;
    listNotifications(limit?: number, unreadOnly?: boolean): Promise<readonly NotificationRecord[]>;
    markRead(id: string): Promise<NotificationRecord | null>;
    private persistIncident;
    private emitNotification;
}
export declare const notificationsStatusSchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<{
        open: "open";
        acknowledged: "acknowledged";
        resolved: "resolved";
    }>>;
    unreadOnly: z.ZodDefault<z.ZodCoercedBoolean<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
//# sourceMappingURL=notifications.d.ts.map