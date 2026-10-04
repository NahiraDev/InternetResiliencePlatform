-- CreateTable: durable arbitration-conflict journal for intent arbitration UX.
CREATE TABLE "IntentConflictRecord" (
  "id" VARCHAR(256) NOT NULL,
  "intentAId" VARCHAR(128) NOT NULL,
  "intentBId" VARCHAR(128) NOT NULL,
  "reason" TEXT NOT NULL,
  "resolution" VARCHAR(32) NOT NULL,
  "ownerScopeKey" VARCHAR(384) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntentConflictRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntentConflictRecord_ownerScopeKey_recordedAt_idx"
  ON "IntentConflictRecord" ("ownerScopeKey", "recordedAt");
