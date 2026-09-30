CREATE TABLE "NetworkIntentRecord" (
  "id" VARCHAR(128) NOT NULL,
  "version" INTEGER NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  "priority" VARCHAR(16) NOT NULL,
  "spec" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "effectiveFrom" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "supersedes" VARCHAR(128),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "provenance" VARCHAR(512),
  "confidence" DOUBLE PRECISION,
  "autonomy" VARCHAR(40),
  "ownerPrincipalId" VARCHAR(255) NOT NULL,
  "organizationId" VARCHAR(128),
  "idempotencyKey" VARCHAR(128),
  "idempotencyFingerprint" VARCHAR(64),
  CONSTRAINT "NetworkIntentRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NetworkIntentRecord_ownerPrincipalId_status_updatedAt_idx"
  ON "NetworkIntentRecord" ("ownerPrincipalId", "status", "updatedAt");
CREATE INDEX "NetworkIntentRecord_organizationId_status_updatedAt_idx"
  ON "NetworkIntentRecord" ("organizationId", "status", "updatedAt");
CREATE UNIQUE INDEX "NetworkIntentRecord_ownerPrincipalId_idempotencyKey_key"
  ON "NetworkIntentRecord" ("ownerPrincipalId", "idempotencyKey");