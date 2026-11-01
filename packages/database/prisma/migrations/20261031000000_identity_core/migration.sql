-- Identity core: the schema declared these models since phase 5 but no migration ever created the
-- tables (only the enums/extensions), so a freshly migrated database had no User/Session/Token/AuditLog.
-- Additive to the legacy phase-5 migration. Roll back with rollbacks/20261031000000_identity_core.down.sql.

CREATE TABLE "User" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" CITEXT NOT NULL,
  "name" TEXT,
  "passwordHash" TEXT NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'pending',
  "roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "emailVerifiedAt" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_status_createdAt_idx" ON "User"("status", "createdAt");
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

CREATE TABLE "Organization" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "ownerUserId" UUID,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Organization_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "Organization_deletedAt_idx" ON "Organization"("deletedAt");
CREATE INDEX "Organization_ownerUserId_idx" ON "Organization"("ownerUserId");

CREATE TABLE "Project" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "Project_organizationId_slug_key" ON "Project"("organizationId", "slug");
CREATE INDEX "Project_organizationId_deletedAt_idx" ON "Project"("organizationId", "deletedAt");

CREATE TABLE "Workspace" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "projectId" UUID,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Workspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "Workspace_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "Workspace_organizationId_slug_key" ON "Workspace"("organizationId", "slug");
CREATE INDEX "Workspace_organizationId_projectId_deletedAt_idx" ON "Workspace"("organizationId", "projectId", "deletedAt");

CREATE TABLE "Role" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "system" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Role_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "Role_organizationId_slug_key" ON "Role"("organizationId", "slug");

CREATE TABLE "Permission" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "action" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Permission_action_key" ON "Permission"("action");

CREATE TABLE "RolePermission" (
  "roleId" UUID NOT NULL,
  "permissionId" UUID NOT NULL,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permissionId"),
  CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE,
  CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE
);

CREATE TABLE "Membership" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "roleId" UUID NOT NULL,
  "status" "MembershipStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Membership_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "Membership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "Membership_userId_organizationId_key" ON "Membership"("userId", "organizationId");
CREATE INDEX "Membership_organizationId_status_idx" ON "Membership"("organizationId", "status");

CREATE TABLE "Session" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "familyId" UUID NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");
CREATE INDEX "Session_userId_revokedAt_expiresAt_idx" ON "Session"("userId", "revokedAt", "expiresAt");
CREATE INDEX "Session_familyId_idx" ON "Session"("familyId");

CREATE TABLE "Token" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sessionId" UUID,
  "userId" UUID NOT NULL,
  "type" "TokenType" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Token_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Token_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE,
  CONSTRAINT "Token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "Token_tokenHash_key" ON "Token"("tokenHash");
CREATE INDEX "Token_userId_type_expiresAt_idx" ON "Token"("userId", "type", "expiresAt");

CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actorUserId" UUID,
  "action" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "resourceId" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE INDEX "AuditLog_resource_resourceId_idx" ON "AuditLog"("resource", "resourceId");
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

CREATE TABLE "OutboxEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OutboxEvent_processedAt_occurredAt_idx" ON "OutboxEvent"("processedAt", "occurredAt");

CREATE TABLE "CacheEntry" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CacheEntry_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "CacheEntry_expiresAt_idx" ON "CacheEntry"("expiresAt");

-- Shared fixed-window counters so rate limits and brute-force locks hold across API instances.
-- Windows are evaluated with the database clock to avoid inter-instance clock skew.
CREATE TABLE "RateLimitBucket" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "resetAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");
