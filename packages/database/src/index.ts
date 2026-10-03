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
  ownerScopeKey: string;
  idempotencyKey?: string | null;
  idempotencyFingerprint?: string | null;
}

const jsonValue = (value: unknown): string => JSON.stringify(value ?? {});

export class IntentRepositoryConflictError extends Error {
  readonly code = 'INTENT_REPOSITORY_CONFLICT';
  constructor(message = 'Intent repository conflict') {
    super(message);
    this.name = 'IntentRepositoryConflictError';
  }
}

export interface IntentRepository {
  get(id: string, ownerScopeKey: string): Promise<IntentRecordRow | undefined>;
  list(
    status: string | undefined,
    ownerScopeKey: string,
    limit?: number,
  ): Promise<readonly IntentRecordRow[]>;
  put(row: IntentRecordRow, expectedVersion?: number): Promise<void>;
  findByIdempotency(ownerScopeKey: string, key: string): Promise<IntentRecordRow | undefined>;
}

export const createIntentRepository = (
  client: Pick<DatabaseClient, '$queryRaw'>,
): IntentRepository => ({
  async get(id, ownerScopeKey) {
    const rows =
      await client.$queryRaw`SELECT * FROM "NetworkIntentRecord" WHERE "id" = ${id} AND "ownerScopeKey" = ${ownerScopeKey} LIMIT 1`;
    return (rows as IntentRecordRow[])[0];
  },
  async list(status, ownerScopeKey, limit = 100) {
    const bounded = Math.min(100, Math.max(1, limit));
    if (status)
      return (await client.$queryRaw`SELECT * FROM "NetworkIntentRecord" WHERE "ownerScopeKey" = ${ownerScopeKey} AND "status" = ${status} ORDER BY "updatedAt" DESC LIMIT ${bounded}`) as IntentRecordRow[];
    return (await client.$queryRaw`SELECT * FROM "NetworkIntentRecord" WHERE "ownerScopeKey" = ${ownerScopeKey} ORDER BY "updatedAt" DESC LIMIT ${bounded}`) as IntentRecordRow[];
  },
  async put(row, expectedVersion) {
    if (expectedVersion === undefined) {
      const inserted =
        await client.$queryRaw`INSERT INTO "NetworkIntentRecord" ("id","version","status","priority","spec","createdAt","updatedAt","effectiveFrom","expiresAt","supersedes","metadata","provenance","confidence","autonomy","ownerPrincipalId","organizationId","ownerScopeKey","idempotencyKey","idempotencyFingerprint") VALUES (${row.id},${row.version},${row.status},${row.priority},${jsonValue(row.spec)}::jsonb,${row.createdAt},${row.updatedAt},${row.effectiveFrom ?? null},${row.expiresAt ?? null},${row.supersedes ?? null},${jsonValue(row.metadata)}::jsonb,${row.provenance ?? null},${row.confidence ?? null},${row.autonomy ?? null},${row.ownerPrincipalId},${row.organizationId ?? null},${row.ownerScopeKey},${row.idempotencyKey ?? null},${row.idempotencyFingerprint ?? null}) ON CONFLICT DO NOTHING RETURNING "id"`;
      if (!Array.isArray(inserted) || inserted.length === 0)
        throw new IntentRepositoryConflictError('Intent id or idempotency key is already in use.');
      return;
    }
    const updated =
      await client.$queryRaw`UPDATE "NetworkIntentRecord" SET "version"=${row.version},"status"=${row.status},"priority"=${row.priority},"spec"=${jsonValue(row.spec)}::jsonb,"updatedAt"=${row.updatedAt},"effectiveFrom"=${row.effectiveFrom ?? null},"expiresAt"=${row.expiresAt ?? null},"supersedes"=${row.supersedes ?? null},"metadata"=${jsonValue(row.metadata)}::jsonb,"provenance"=${row.provenance ?? null},"confidence"=${row.confidence ?? null},"autonomy"=${row.autonomy ?? null} WHERE "id"=${row.id} AND "ownerScopeKey"=${row.ownerScopeKey} AND "version"=${expectedVersion} RETURNING "id"`;
    if (!Array.isArray(updated) || updated.length === 0)
      throw new IntentRepositoryConflictError('Intent version or ownership conflict.');
  },
  async findByIdempotency(ownerScopeKey, key) {
    const rows =
      await client.$queryRaw`SELECT * FROM "NetworkIntentRecord" WHERE "ownerScopeKey" = ${ownerScopeKey} AND "idempotencyKey" = ${key} LIMIT 1`;
    return (rows as IntentRecordRow[])[0];
  },
});
