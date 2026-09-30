import { Pool } from 'pg';

export type DatabaseClient = {
  $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  $disconnect(): Promise<void>;
};

const createMemoryDatabaseClient = (): DatabaseClient => ({
  async $queryRaw(): Promise<unknown> {
    return [{ ok: 1 }];
  },
  async $disconnect(): Promise<void> {
    return undefined;
  },
});

export const createPrismaClient = (databaseUrl = process.env.DATABASE_URL): DatabaseClient => {
  if (!databaseUrl) return createMemoryDatabaseClient();
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  return {
    async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown> {
      const text = strings.reduce(
        (sql, part, index) => `${sql}${part}${index < values.length ? `$${index + 1}` : ''}`,
        '',
      );
      const result = await pool.query(text, values);
      return result.rows;
    },
    async $disconnect(): Promise<void> {
      await pool.end();
    },
  };
};
export const createGeneratedPrismaClient = async (
  databaseUrl = process.env.DATABASE_URL,
): Promise<DatabaseClient> => createPrismaClient(databaseUrl);
export interface DatabaseHealth {
  ok: boolean;
  latencyMs: number;
}
export const checkDatabaseHealth = async (
  client: Pick<DatabaseClient, '$queryRaw'>,
): Promise<DatabaseHealth> => {
  const started = performance.now();
  await client.$queryRaw`SELECT 1`;
  return { ok: true, latencyMs: Math.round(performance.now() - started) };
};


export interface IntentRecordRow {
  id: string;
  version: number;
  status: string;
  priority: string;
  spec: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
  effectiveFrom?: Date | string | null;
  expiresAt?: Date | string | null;
  supersedes?: string | null;
  metadata: unknown;
  provenance?: string | null;
  confidence?: number | null;
  autonomy?: string | null;
  ownerPrincipalId: string;
  organizationId?: string | null;
  idempotencyKey?: string | null;
  idempotencyFingerprint?: string | null;
}

const jsonValue = (value: unknown): string => JSON.stringify(value ?? {});

export interface IntentRepository {
  get(id: string, principalId: string, organizationId?: string): Promise<IntentRecordRow | undefined>;
  list(status: string | undefined, principalId: string, organizationId?: string, limit?: number): Promise<readonly IntentRecordRow[]>;
  put(row: IntentRecordRow, expectedVersion?: number): Promise<void>;
  findByIdempotency(principalId: string, key: string): Promise<IntentRecordRow | undefined>;
}

export const createIntentRepository = (client: Pick<DatabaseClient, '$queryRaw'>): IntentRepository => ({
  async get(id, principalId, organizationId) {
    const rows = organizationId
      ? await client.$queryRaw\`SELECT * FROM "NetworkIntentRecord" WHERE "id" = \${id} AND "organizationId" = \${organizationId} LIMIT 1\`
      : await client.$queryRaw\`SELECT * FROM "NetworkIntentRecord" WHERE "id" = \${id} AND "ownerPrincipalId" = \${principalId} AND "organizationId" IS NULL LIMIT 1\`;
    return (rows as IntentRecordRow[])[0];
  },
  async list(status, principalId, organizationId, limit = 100) {
    const bounded = Math.min(100, Math.max(1, limit));
    if (organizationId && status)
      return (await client.$queryRaw\`SELECT * FROM "NetworkIntentRecord" WHERE "organizationId" = \${organizationId} AND "status" = \${status} ORDER BY "updatedAt" DESC LIMIT \${bounded}\`) as IntentRecordRow[];
    if (organizationId)
      return (await client.$queryRaw\`SELECT * FROM "NetworkIntentRecord" WHERE "organizationId" = \${organizationId} ORDER BY "updatedAt" DESC LIMIT \${bounded}\`) as IntentRecordRow[];
    if (status)
      return (await client.$queryRaw\`SELECT * FROM "NetworkIntentRecord" WHERE "ownerPrincipalId" = \${principalId} AND "organizationId" IS NULL AND "status" = \${status} ORDER BY "updatedAt" DESC LIMIT \${bounded}\`) as IntentRecordRow[];
    return (await client.$queryRaw\`SELECT * FROM "NetworkIntentRecord" WHERE "ownerPrincipalId" = \${principalId} AND "organizationId" IS NULL ORDER BY "updatedAt" DESC LIMIT \${bounded}\`) as IntentRecordRow[];
  },
  async put(row) {
    await client.$queryRaw\`INSERT INTO "NetworkIntentRecord" ("id","version","status","priority","spec","createdAt","updatedAt","effectiveFrom","expiresAt","supersedes","metadata","provenance","confidence","autonomy","ownerPrincipalId","organizationId","idempotencyKey","idempotencyFingerprint") VALUES (\${row.id},\${row.version},\${row.status},\${row.priority},\${jsonValue(row.spec)}::jsonb,\${row.createdAt},\${row.updatedAt},\${row.effectiveFrom ?? null},\${row.expiresAt ?? null},\${row.supersedes ?? null},\${jsonValue(row.metadata)}::jsonb,\${row.provenance ?? null},\${row.confidence ?? null},\${row.autonomy ?? null},\${row.ownerPrincipalId},\${row.organizationId ?? null},\${row.idempotencyKey ?? null},\${row.idempotencyFingerprint ?? null}) ON CONFLICT ("id") DO UPDATE SET "version"=EXCLUDED."version","status"=EXCLUDED."status","priority"=EXCLUDED."priority","spec"=EXCLUDED."spec","updatedAt"=EXCLUDED."updatedAt","effectiveFrom"=EXCLUDED."effectiveFrom","expiresAt"=EXCLUDED."expiresAt","supersedes"=EXCLUDED."supersedes","metadata"=EXCLUDED."metadata","provenance"=EXCLUDED."provenance","confidence"=EXCLUDED."confidence","autonomy"=EXCLUDED."autonomy"\`;
  },
  async findByIdempotency(principalId, key) {
    const rows = await client.$queryRaw\`SELECT * FROM "NetworkIntentRecord" WHERE "ownerPrincipalId" = \${principalId} AND "idempotencyKey" = \${key} LIMIT 1\`;
    return (rows as IntentRecordRow[])[0];
  },
});
