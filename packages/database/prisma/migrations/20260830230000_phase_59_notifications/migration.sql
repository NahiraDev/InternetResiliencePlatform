-- Phase 59: Notifications & Incident Center
CREATE TYPE "IncidentSeverity" AS ENUM ('info', 'warning', 'critical');
CREATE TYPE "IncidentStatus" AS ENUM ('open', 'acknowledged', 'resolved');
CREATE TYPE "NotificationType" AS ENUM ('incident_opened', 'incident_updated', 'incident_resolved', 'action_required');

CREATE TABLE "Incident" (
  "id" UUID NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "severity" "IncidentSeverity" NOT NULL,
  "status" "IncidentStatus" NOT NULL DEFAULT 'open',
  "source" TEXT NOT NULL,
  "classification" TEXT NOT NULL,
  "rootCause" TEXT NOT NULL,
  "affectedComponents" JSONB NOT NULL,
  "evidence" JSONB NOT NULL,
  "correlationReason" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Incident_fingerprint_key" ON "Incident"("fingerprint");
CREATE INDEX "Incident_status_severity_lastSeenAt_idx" ON "Incident"("status", "severity", "lastSeenAt");
CREATE INDEX "Incident_source_lastSeenAt_idx" ON "Incident"("source", "lastSeenAt");

CREATE TABLE "Notification" (
  "id" UUID NOT NULL,
  "incidentId" UUID NOT NULL,
  "type" "NotificationType" NOT NULL,
  "severity" "IncidentSeverity" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "actionable" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_readAt_createdAt_idx" ON "Notification"("readAt", "createdAt");
CREATE INDEX "Notification_incidentId_createdAt_idx" ON "Notification"("incidentId", "createdAt");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
