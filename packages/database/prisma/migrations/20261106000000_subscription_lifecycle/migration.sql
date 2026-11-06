-- Subscription lifecycle: plans, subscriptions, payments, devices, entitlements.
-- Lifecycle: REGISTERED -> PAYMENT_PENDING -> ACTIVE -> EXPIRED / CANCELLED.
-- Backend-authoritative: frontend claims of payment success are never trusted.
-- Roll back with rollbacks/20261106000000_subscription_lifecycle.down.sql.

-- Enum types
CREATE TYPE "SubscriptionStatus" AS ENUM ('REGISTERED', 'PAYMENT_PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');
CREATE TYPE "DeviceStatus" AS ENUM ('ENROLLED', 'ACTIVE', 'SUSPENDED', 'REVOKED');
CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

CREATE TABLE "SubscriptionPlan" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "priceUsd" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "durationDays" INTEGER NOT NULL,
  "maxDevices" INTEGER NOT NULL DEFAULT 1,
  "features" JSONB NOT NULL DEFAULT '{}',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SubscriptionPlan_slug_key" ON "SubscriptionPlan"("slug");
CREATE INDEX "SubscriptionPlan_isActive_slug_idx" ON "SubscriptionPlan"("isActive", "slug");

CREATE TABLE "Subscription" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "planId" UUID NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'REGISTERED',
  "startedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "renewedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "autoRenew" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT
);
CREATE INDEX "Subscription_userId_status_idx" ON "Subscription"("userId", "status");
CREATE INDEX "Subscription_planId_status_idx" ON "Subscription"("planId", "status");

CREATE TABLE "PaymentTransaction" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "subscriptionId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "amountUsd" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "provider" TEXT NOT NULL,
  "providerRef" TEXT,
  "paidAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentTransaction_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE,
  CONSTRAINT "PaymentTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "PaymentTransaction_subscriptionId_status_idx" ON "PaymentTransaction"("subscriptionId", "status");
CREATE INDEX "PaymentTransaction_userId_status_idx" ON "PaymentTransaction"("userId", "status");
CREATE UNIQUE INDEX "PaymentTransaction_providerRef_key" ON "PaymentTransaction"("providerRef");

CREATE TABLE "Device" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "subscriptionId" UUID,
  "deviceId" TEXT NOT NULL,
  "label" TEXT,
  "platform" TEXT,
  "status" "DeviceStatus" NOT NULL DEFAULT 'ENROLLED',
  "authorizedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "lastConnectedAt" TIMESTAMP(3),
  "lastDisconnectedAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Device_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "Device_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "Device_deviceId_key" ON "Device"("deviceId");
CREATE INDEX "Device_userId_status_idx" ON "Device"("userId", "status");
CREATE INDEX "Device_subscriptionId_idx" ON "Device"("subscriptionId");

CREATE TABLE "ConnectionState" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "deviceId" UUID NOT NULL,
  "connected" BOOLEAN NOT NULL DEFAULT false,
  "quality" TEXT,
  "latencyMs" INTEGER,
  "reason" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectionState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConnectionState_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE
);
CREATE INDEX "ConnectionState_deviceId_recordedAt_idx" ON "ConnectionState"("deviceId", "recordedAt");

CREATE TABLE "Entitlement" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "subscriptionId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "feature" TEXT NOT NULL,
  "status" "EntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Entitlement_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE,
  CONSTRAINT "Entitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "Entitlement_userId_feature_status_idx" ON "Entitlement"("userId", "feature", "status");
CREATE INDEX "Entitlement_subscriptionId_status_idx" ON "Entitlement"("subscriptionId", "status");
