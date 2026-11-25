import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, createSqlClient, type SqlClient } from '@irp/database';
import { buildServer } from './index.js';
import { CapturingEmailSender } from './identity/mailer.js';
import { createPostgresIdentityRepositories } from './identity/postgres.js';
import { createPostgresRemoteClientStore } from './remote-client-store.js';
import { createPostgresSettingsStore } from './durability.js';
import { resolveRemoteClientKeys } from './remote-client-api.js';

/**
 * Issue #411: when every database connection is busy the API must answer quickly with an error status,
 * never hang. Real PostgreSQL, deliberately tiny pools. Requires IRP_TEST_DATABASE_URL (hard failure in CI).
 */
const adminUrl = process.env.IRP_TEST_DATABASE_URL;
if (!adminUrl && process.env.CI)
  throw new Error('IRP_TEST_DATABASE_URL is required in CI for the PostgreSQL integration tests.');
const maybe = adminUrl ? describe : describe.skip;

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/database/prisma/migrations');
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
const timed = async <T>(fn: () => Promise<T>) => {
  const start = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - start };
};

maybe('database saturation returns errors, never hangs', () => {
  const dbName = `irp_sat_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  let url = '';
  const pools: SqlClient[] = [];

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    await admin.end();
    url = withDb(adminUrl!, dbName);
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    for (const m of readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort())
      await c.query(readFileSync(join(migrationsDir, m, 'migration.sql'), 'utf8'));
    await c.end();
  }, 60_000);
  afterAll(async () => {
    await Promise.allSettled(pools.map((p) => p.end()));
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end();
  }, 60_000);

  it('SqlClient: a saturated pool rejects within the connection timeout', async () => {
    const sql = createSqlClient(url, { max: 2, connectionTimeoutMs: 300 });
    pools.push(sql);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const holders = [1, 2].map(() => sql.transaction(async () => gate));
    await new Promise((r) => setTimeout(r, 150)); // both connections are now checked out
    const { value, ms } = await timed(() => sql.query('select 1').then(() => 'ok', (e: Error) => e.message));
    expect(value).toMatch(/timeout/i);
    expect(ms).toBeLessThan(1500);
    release();
    await Promise.all(holders);
    expect(await sql.query('select 1 as ok')).toEqual([{ ok: 1 }]); // recovers once connections free up
  }, 30_000);

  it('Prisma-style client (used by history, intents, notifications) also times out instead of waiting forever', async () => {
    const db = createPrismaClient(url, { max: 1, connectionTimeoutMs: 300 });
    const slow = db.$queryRaw`select pg_sleep(3)`; // holds the only connection
    await new Promise((r) => setTimeout(r, 150));
    const { value, ms } = await timed(() => db.$queryRaw`select 1`.then(() => 'ok', (e: Error) => e.message));
    expect(value).toMatch(/timeout/i);
    expect(ms).toBeLessThan(1500);
    await slow;
    await db.$disconnect();
  }, 30_000);

  it('API: login and /ready answer 5xx quickly while the identity pool is exhausted, then recover', async () => {
    const sql = createSqlClient(url, { max: 2, connectionTimeoutMs: 300 });
    pools.push(sql);
    const app = await buildServer({
      identity: createPostgresIdentityRepositories(sql),
      mailer: new CapturingEmailSender(),
      remoteClientStore: createPostgresRemoteClientStore(sql, resolveRemoteClientKeys()),
      settings: createPostgresSettingsStore(sql),
    });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const holders = [1, 2].map(() => sql.transaction(async () => gate));
    await new Promise((r) => setTimeout(r, 150));

    const ready = await timed(() => app.inject({ method: 'GET', url: '/api/v1/ready' }));
    expect(ready.value.statusCode).toBe(503);
    expect(ready.ms).toBeLessThan(3000);

    const login = await timed(() =>
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        remoteAddress: '10.8.8.8',
        payload: { email: 'nobody@example.com', password: 'Production12345' },
      }),
    );
    expect(login.value.statusCode).toBe(503);
    expect(login.ms).toBeLessThan(3000);

    release();
    await Promise.all(holders);
    expect((await app.inject({ method: 'GET', url: '/api/v1/ready' })).statusCode).toBe(200);
    await app.close();
  }, 30_000);
});
