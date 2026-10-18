import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '@irp/database';
import {
  DatabaseIntentStore,
  type ArbitrationConflict,
  type IntentOwnership,
} from './intent-api.js';

// Set DATABASE_URL to a disposable PostgreSQL database to exercise the real
// SQL path. The max-one connection keeps temporary tables alive for this test.
const postgresDescribe = describe.skipIf(!process.env.DATABASE_URL);

postgresDescribe('PostgreSQL conflict journal integration', () => {
  const ownerA: IntentOwnership = { principalId: 'pg-principal-a' };
  const ownerB: IntentOwnership = { principalId: 'pg-principal-b' };
  let client: ReturnType<typeof createPrismaClient>;

  beforeAll(async () => {
    client = createPrismaClient(process.env.DATABASE_URL, { max: 1 });
    await client.$queryRaw`CREATE TEMP TABLE "IntentConflictRecord" (
      "id" TEXT PRIMARY KEY,
      "intentAId" TEXT NOT NULL,
      "intentBId" TEXT NOT NULL,
      "reason" TEXT NOT NULL,
      "resolution" TEXT NOT NULL,
      "ownerScopeKey" TEXT NOT NULL,
      "recordedAt" TIMESTAMPTZ NOT NULL
    )`;
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  it('persists conflicts across store instances without crossing owner scopes', async () => {
    const timestamp = new Date().toISOString();
    const conflict: ArbitrationConflict = {
      intentA: { intentId: 'pg-a', desiredOutcome: 'primary', priority: 'high', version: 1 },
      intentB: { intentId: 'pg-b', desiredOutcome: 'secondary', priority: 'normal', version: 1 },
      reason: 'same target conflict',
      resolution: 'supersede-a',
      timestamp,
    };

    const writer = new DatabaseIntentStore(client);
    await writer.recordConflict(conflict, ownerA);
    // The same logical conflict under another owner must get a distinct row ID.
    await writer.recordConflict(conflict, ownerB);

    // A new store has no in-memory mirror; reads must come from PostgreSQL.
    const reader = new DatabaseIntentStore(client);
    const fromA = await reader.listConflicts(ownerA, 10);
    const fromB = await reader.listConflicts(ownerB, 10);

    expect(fromA).toHaveLength(1);
    expect(fromA[0]).toMatchObject({
      intentA: { intentId: 'pg-a' },
      intentB: { intentId: 'pg-b' },
      reason: 'same target conflict',
    });
    expect(fromB).toHaveLength(1);
    expect(fromB[0]).toMatchObject({ reason: 'same target conflict' });
  });
});
