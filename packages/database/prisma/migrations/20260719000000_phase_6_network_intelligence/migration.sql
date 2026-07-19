CREATE TYPE "NetworkNodeStatus" AS ENUM ('active', 'degraded', 'offline', 'unknown');
CREATE TABLE "NetworkMeasurement" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "probeType" TEXT NOT NULL,
  "latency" DOUBLE PRECISION,
  "success" BOOLEAN NOT NULL,
  "error" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "NetworkMeasurement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NetworkMeasurement_probeType_timestamp_idx" ON "NetworkMeasurement"("probeType", "timestamp");
CREATE INDEX "NetworkMeasurement_success_timestamp_idx" ON "NetworkMeasurement"("success", "timestamp");
CREATE TABLE "NetworkNode" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "location" TEXT,
  "endpoint" TEXT NOT NULL,
  "status" "NetworkNodeStatus" NOT NULL DEFAULT 'unknown',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NetworkNode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NetworkNode_status_idx" ON "NetworkNode"("status");
CREATE TABLE "NetworkHealthScore" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "score" DOUBLE PRECISION NOT NULL,
  "factors" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "NetworkHealthScore_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NetworkHealthScore_timestamp_idx" ON "NetworkHealthScore"("timestamp");
