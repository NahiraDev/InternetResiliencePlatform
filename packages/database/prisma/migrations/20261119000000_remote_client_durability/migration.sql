-- Durable remote-client (device) state and platform settings.
-- Replaces process-local Maps/classes in apps/api (issue #410, docs/audit/REMAINING_WORK.md row 6):
-- device credentials, rotating refresh tokens, enrollment requests and the client security audit log
-- previously lived in memory, so a cold start or a second instance silently lost or disagreed on them.
-- Only digests are stored: the credential secret and refresh token themselves are never persisted.
-- Roll back with rollbacks/20261119000000_remote_client_durability.down.sql.

CREATE TABLE "RemoteClientCredential" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "deviceId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "label" TEXT,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "secretDigest" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RemoteClientCredential_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RemoteClientCredential_deviceId_idx" ON "RemoteClientCredential"("deviceId");

CREATE TABLE "RemoteClientRefreshToken" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "credentialId" UUID NOT NULL,
  "tokenDigest" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "RemoteClientRefreshToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RemoteClientRefreshToken_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "RemoteClientCredential"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "RemoteClientRefreshToken_tokenDigest_key" ON "RemoteClientRefreshToken"("tokenDigest");
CREATE INDEX "RemoteClientRefreshToken_credentialId_revokedAt_idx" ON "RemoteClientRefreshToken"("credentialId", "revokedAt");

CREATE TABLE "RemoteClientEnrollmentRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "label" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "decidedAt" TIMESTAMP(3),
  "decidedBy" TEXT,
  "credentialId" UUID,
  "deviceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RemoteClientEnrollmentRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RemoteClientEnrollmentRequest_status_createdAt_idx" ON "RemoteClientEnrollmentRequest"("status", "createdAt");

CREATE TABLE "RemoteClientAuditEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "action" TEXT NOT NULL,
  "subjectId" TEXT,
  "deviceId" TEXT,
  "credentialId" TEXT,
  "success" BOOLEAN NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "RemoteClientAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RemoteClientAuditEvent_at_idx" ON "RemoteClientAuditEvent"("at");

-- Small key/value store for operator-controlled platform settings that must survive restarts and be
-- identical across instances (currently: zero-cost personal mode).
CREATE TABLE "PlatformSetting" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);
