import { Pool } from 'pg';
const createMemoryDatabaseClient = () => ({
    async $queryRaw() {
        return [{ ok: 1 }];
    },
    async $disconnect() {
        return undefined;
    },
});
const isProductionRuntime = () => ['production', 'staging'].includes((process.env.NODE_ENV ?? '').toLowerCase());
/**
 * Default handler for errors emitted by idle pooled clients. node-postgres
 * emits 'error' on the pool when an idle client loses its connection (for
 * example a PostgreSQL restart, failover or `pg_terminate_backend`). Without a
 * listener Node treats it as an unhandled 'error' event and terminates the
 * process, turning a recoverable database outage into an API crash. The pool
 * discards the broken client and the next query reconnects; in-flight and
 * subsequent queries still reject, so readiness checks report the outage.
 */
export const reportIdleClientError = (error) => {
    process.stderr.write(`${JSON.stringify({ level: 'warn', msg: 'database idle client error', error: error.message })}\n`);
};
export const createPrismaClient = (databaseUrl = process.env.DATABASE_URL, options = {}) => {
    if (!databaseUrl) {
        if (isProductionRuntime()) {
            throw new Error('DATABASE_URL is required for production or staging database runtime; refusing the in-memory database fallback.');
        }
        return createMemoryDatabaseClient();
    }
    const pool = new Pool({ connectionString: databaseUrl, max: options.max ?? 5 });
    pool.on('error', options.onIdleClientError ?? reportIdleClientError);
    return {
        async $queryRaw(strings, ...values) {
            const text = strings.reduce((sql, part, index) => `${sql}${part}${index < values.length ? `$${index + 1}` : ''}`, '');
            const result = await pool.query(text, values);
            return result.rows;
        },
        async $disconnect() {
            await pool.end();
        },
    };
};
export const createGeneratedPrismaClient = async (databaseUrl = process.env.DATABASE_URL, options = {}) => createPrismaClient(databaseUrl, options);
export const createSqlClient = (databaseUrl, options = {}) => {
    if (!databaseUrl)
        throw new Error('createSqlClient requires a DATABASE_URL.');
    const pool = new Pool({
        connectionString: databaseUrl,
        max: options.max ?? 5,
        connectionTimeoutMillis: options.connectionTimeoutMs ?? 5_000,
        idleTimeoutMillis: options.idleTimeoutMs ?? 10_000,
        statement_timeout: options.statementTimeoutMs ?? 15_000,
    });
    pool.on('error', options.onIdleClientError ?? reportIdleClientError);
    return {
        async query(text, values = []) {
            const result = await pool.query(text, [...values]);
            return result.rows;
        },
        async transaction(fn) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const tx = {
                    async query(text, values = []) {
                        return (await client.query(text, [...values])).rows;
                    },
                };
                const out = await fn(tx);
                await client.query('COMMIT');
                return out;
            }
            catch (error) {
                await client.query('ROLLBACK').catch(() => undefined);
                throw error;
            }
            finally {
                client.release();
            }
        },
        async end() {
            await pool.end();
        },
    };
};
export const checkDatabaseHealth = async (client) => {
    const started = performance.now();
    await client.$queryRaw `SELECT 1`;
    return { ok: true, latencyMs: Math.round(performance.now() - started) };
};
const jsonValue = (value) => JSON.stringify(value ?? {});
export class IntentRepositoryConflictError extends Error {
    code = 'INTENT_REPOSITORY_CONFLICT';
    constructor(message = 'Intent repository conflict') {
        super(message);
        this.name = 'IntentRepositoryConflictError';
    }
}
export const createIntentRepository = (client) => ({
    async get(id, ownerScopeKey) {
        const rows = await client.$queryRaw `SELECT * FROM "NetworkIntentRecord" WHERE "id" = ${id} AND "ownerScopeKey" = ${ownerScopeKey} LIMIT 1`;
        return rows[0];
    },
    async list(status, ownerScopeKey, limit = 100) {
        const bounded = Math.min(100, Math.max(1, limit));
        if (status)
            return (await client.$queryRaw `SELECT * FROM "NetworkIntentRecord" WHERE "ownerScopeKey" = ${ownerScopeKey} AND "status" = ${status} ORDER BY "updatedAt" DESC LIMIT ${bounded}`);
        return (await client.$queryRaw `SELECT * FROM "NetworkIntentRecord" WHERE "ownerScopeKey" = ${ownerScopeKey} ORDER BY "updatedAt" DESC LIMIT ${bounded}`);
    },
    async put(row, expectedVersion) {
        if (expectedVersion === undefined) {
            const inserted = await client.$queryRaw `INSERT INTO "NetworkIntentRecord" ("id","version","status","priority","spec","createdAt","updatedAt","effectiveFrom","expiresAt","supersedes","metadata","provenance","confidence","autonomy","ownerPrincipalId","organizationId","ownerScopeKey","idempotencyKey","idempotencyFingerprint") VALUES (${row.id},${row.version},${row.status},${row.priority},${jsonValue(row.spec)}::jsonb,${row.createdAt},${row.updatedAt},${row.effectiveFrom ?? null},${row.expiresAt ?? null},${row.supersedes ?? null},${jsonValue(row.metadata)}::jsonb,${row.provenance ?? null},${row.confidence ?? null},${row.autonomy ?? null},${row.ownerPrincipalId},${row.organizationId ?? null},${row.ownerScopeKey},${row.idempotencyKey ?? null},${row.idempotencyFingerprint ?? null}) ON CONFLICT DO NOTHING RETURNING "id"`;
            if (!Array.isArray(inserted) || inserted.length === 0)
                throw new IntentRepositoryConflictError('Intent id or idempotency key is already in use.');
            return;
        }
        const updated = await client.$queryRaw `UPDATE "NetworkIntentRecord" SET "version"=${row.version},"status"=${row.status},"priority"=${row.priority},"spec"=${jsonValue(row.spec)}::jsonb,"updatedAt"=${row.updatedAt},"effectiveFrom"=${row.effectiveFrom ?? null},"expiresAt"=${row.expiresAt ?? null},"supersedes"=${row.supersedes ?? null},"metadata"=${jsonValue(row.metadata)}::jsonb,"provenance"=${row.provenance ?? null},"confidence"=${row.confidence ?? null},"autonomy"=${row.autonomy ?? null} WHERE "id"=${row.id} AND "ownerScopeKey"=${row.ownerScopeKey} AND "version"=${expectedVersion} RETURNING "id"`;
        if (!Array.isArray(updated) || updated.length === 0)
            throw new IntentRepositoryConflictError('Intent version or ownership conflict.');
    },
    async findByIdempotency(ownerScopeKey, key) {
        const rows = await client.$queryRaw `SELECT * FROM "NetworkIntentRecord" WHERE "ownerScopeKey" = ${ownerScopeKey} AND "idempotencyKey" = ${key} LIMIT 1`;
        return rows[0];
    },
    async recordConflict(row) {
        await client.$queryRaw `INSERT INTO "IntentConflictRecord" ("id","intentAId","intentBId","reason","resolution","ownerScopeKey","recordedAt") VALUES (${row.id},${row.intentAId},${row.intentBId},${row.reason},${row.resolution},${row.ownerScopeKey},${row.recordedAt}) ON CONFLICT ("id") DO NOTHING`;
    },
    async listConflicts(ownerScopeKey, limit = 100, since) {
        const bounded = Math.min(100, Math.max(1, limit));
        if (since)
            return (await client.$queryRaw `SELECT * FROM "IntentConflictRecord" WHERE "ownerScopeKey" = ${ownerScopeKey} AND "recordedAt" > ${since} ORDER BY "recordedAt" DESC LIMIT ${bounded}`);
        return (await client.$queryRaw `SELECT * FROM "IntentConflictRecord" WHERE "ownerScopeKey" = ${ownerScopeKey} ORDER BY "recordedAt" DESC LIMIT ${bounded}`);
    },
    async getConflict(id, ownerScopeKey) {
        const rows = await client.$queryRaw `SELECT * FROM "IntentConflictRecord" WHERE "id" = ${id} AND "ownerScopeKey" = ${ownerScopeKey} LIMIT 1`;
        return rows[0];
    },
});
//# sourceMappingURL=index.js.map