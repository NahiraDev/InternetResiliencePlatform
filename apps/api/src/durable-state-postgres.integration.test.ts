import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JwtService, hashPassword } from '@irp/auth';
import { mapErrorToHttp } from '@irp/core';
import { createPrismaClient, createSqlClient, type SqlClient } from '@irp/database';
import { buildServer } from './index.js';
import { CapturingEmailSender } from './identity/mailer.js';
import { createPostgresIdentityRepositories } from './identity/postgres.js';
import { createPostgresSettingsStore } from './durability.js';
import { NotificationIncidentCenter } from './notifications.js';
import { registerRemoteClientRoutes } from './remote-client-api.js';
import { createPostgresRemoteClientStore } from './remote-client-store.js';

/**
 * Real-PostgreSQL evidence for issue #410 (state that used to live in process memory): remote-client
 * credentials/refresh tokens/enrollment requests/audit, platform settings and incident persistence.
 * Every scenario runs against independent app instances sharing one database, and "restart" means new
 * pools, new stores and new app objects. Set IRP_TEST_DATABASE_URL to a role that may CREATE DATABASE.
 * In CI (CI=true) a missing URL is a hard failure, never a silent skip.
 */
const adminUrl = process.env.IRP_TEST_DATABASE_URL;
if (!adminUrl && process.env.CI)
  throw new Error('IRP_TEST_DATABASE_URL is required in CI for the PostgreSQL integration tests.');
const maybe = adminUrl ? describe : describe.skip;

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/database/prisma');
const migrations = readdirSync(join(root, 'migrations'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const REMOTE_MIGRATION = '20261119000000_remote_client_durability';
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

const jwtSecret = 'j'.repeat(48);
const keys = { credentialKey: 'c'.repeat(48), refreshKey: 'r'.repeat(48) };
const adminToken = () =>
  new JwtService(jwtSecret, 'irp').sign({
    sub: 'admin-1',
    roles: ['platform_admin'],
    scopes: ['runtime.admin'],
    type: 'access',
    ttlSeconds: 900,
  });
const userToken = (sub: string) =>
  new JwtService(jwtSecret, 'irp').sign({
    sub,
    roles: ['member'],
    scopes: [],
    type: 'access',
    ttlSeconds: 900,
  });
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

maybe('PostgreSQL durable API state (real database)', () => {
  const dbName = `irp_dur_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  let url = '';
  const pools: SqlClient[] = [];

  const run = async (target: string, files: string[]) => {
    const c = new pg.Client({ connectionString: target });
    await c.connect();
    for (const f of files) await c.query(readFileSync(f, 'utf8'));
    await c.end();
  };
  const migrationFile = (m: string) => join(root, 'migrations', m, 'migration.sql');

  /** A fresh "process": its own pool, its own store, its own Fastify instance. */
  const remoteInstance = async () => {
    const sql = createSqlClient(url, { max: 4 });
    pools.push(sql);
    const store = createPostgresRemoteClientStore(sql, keys);
    const app = Fastify({ logger: false });
    app.setErrorHandler((error, _request, reply) => {
      const mapped = mapErrorToHttp(error);
      reply.status(mapped.statusCode).send(mapped.body);
    });
    registerRemoteClientRoutes(app, { jwtSecret, ...keys, store });
    await app.ready();
    return { app, store, sql };
  };
  type Remote = Awaited<ReturnType<typeof remoteInstance>>;
  const post = (i: Remote, path: string, payload: unknown, headers: Record<string, string> = {}) =>
    i.app.inject({ method: 'POST', url: path, payload: payload as object, headers });
  const enroll = async (i: Remote, scopes = ['runtime.read']) =>
    (
      await post(
        i,
        '/api/v1/auth/remote/devices/enroll',
        { platform: 'linux', label: 'pg-device', scopes },
        bearer(adminToken()),
      )
    ).json().data as { credentialId: string; deviceId: string; secret: string };
  const exchange = async (i: Remote, device: { credentialId: string; secret: string }) =>
    post(i, '/api/v1/auth/remote/token', {
      credentialId: device.credentialId,
      secret: device.secret,
    });

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    await admin.end();
    url = withDb(adminUrl!, dbName);
    await run(url, migrations.map(migrationFile));
  }, 60_000);
  afterAll(async () => {
    await Promise.allSettled(pools.map((p) => p.end()));
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end();
  }, 60_000);

  it('device credentials and refresh tokens work across two instances, and replay is rejected everywhere', async () => {
    const a = await remoteInstance();
    const b = await remoteInstance();
    const device = await enroll(a);
    // credential issued on A authenticates on B
    const tokenOnB = await exchange(b, device);
    expect(tokenOnB.statusCode).toBe(200);
    const first = tokenOnB.json().data;
    // refresh token issued on B rotates on A
    const rotatedOnA = await post(a, '/api/v1/auth/remote/refresh', { refreshToken: first.refreshToken });
    expect(rotatedOnA.statusCode).toBe(200);
    // replaying the already-used token is rejected on both instances
    for (const i of [a, b])
      expect(
        (await post(i, '/api/v1/auth/remote/refresh', { refreshToken: first.refreshToken })).statusCode,
      ).toBe(401);
    // the rotated token keeps working on the other instance
    expect(
      (await post(b, '/api/v1/auth/remote/refresh', { refreshToken: rotatedOnA.json().data.refreshToken }))
        .statusCode,
    ).toBe(200);
    await a.app.close();
    await b.app.close();
  }, 60_000);

  it('state survives a full restart (new pools, stores and app objects)', async () => {
    const before = await remoteInstance();
    const device = await enroll(before);
    const { refreshToken } = (await exchange(before, device)).json().data;
    const request = await post(
      before,
      '/api/v1/auth/remote/devices/request',
      { platform: 'android', label: 'phone' },
      bearer(userToken('user-restart')),
    );
    expect(request.statusCode).toBe(201);
    await before.app.close();
    await before.sql.end();

    const after = await remoteInstance();
    expect((await exchange(after, device)).statusCode).toBe(200);
    expect((await post(after, '/api/v1/auth/remote/refresh', { refreshToken })).statusCode).toBe(200);
    const pending = (
      await after.app.inject({
        method: 'GET',
        url: '/api/v1/auth/remote/devices/requests',
        headers: bearer(adminToken()),
      })
    ).json().data as Array<{ id: string; userId: string }>;
    expect(pending.find((r) => r.id === request.json().data.requestId)?.userId).toBe('user-restart');
    const audit = (
      await after.app.inject({
        method: 'GET',
        url: '/api/v1/auth/remote/audit',
        headers: bearer(adminToken()),
      })
    ).json().data as Array<{ action: string }>;
    expect(audit.map((e) => e.action)).toEqual(
      expect.arrayContaining(['client.enrolled', 'client.authenticated', 'refresh.rotated']),
    );
    await after.app.close();
  }, 60_000);

  it('lets exactly one of many concurrent refreshes win across instances', async () => {
    const a = await remoteInstance();
    const b = await remoteInstance();
    const device = await enroll(a);
    const { refreshToken } = (await exchange(a, device)).json().data;
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, n) =>
        post(n % 2 ? a : b, '/api/v1/auth/remote/refresh', { refreshToken }),
      ),
    );
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(results.filter((r) => r.statusCode === 401)).toHaveLength(11);
    await a.app.close();
    await b.app.close();
  }, 60_000);

  it('revocation on one instance is honoured immediately by the other', async () => {
    const a = await remoteInstance();
    const b = await remoteInstance();
    const device = await enroll(a);
    const { refreshToken } = (await exchange(b, device)).json().data;
    const revoke = await post(
      a,
      `/api/v1/auth/remote/devices/${device.credentialId}/revoke`,
      {},
      bearer(adminToken()),
    );
    expect(revoke.json().data.revoked).toBe(true);
    expect((await exchange(b, device)).statusCode).toBe(401);
    expect((await post(b, '/api/v1/auth/remote/refresh', { refreshToken })).statusCode).toBe(401);
    const listed = (
      await b.app.inject({ method: 'GET', url: '/api/v1/auth/remote/devices', headers: bearer(adminToken()) })
    ).json().data as Array<{ credentialId: string; revokedAt?: string }>;
    expect(listed.find((d) => d.credentialId === device.credentialId)?.revokedAt).toBeTypeOf('string');
    await a.app.close();
    await b.app.close();
  }, 60_000);

  it('enrollment requests are decided exactly once even when two admins race on different instances', async () => {
    const a = await remoteInstance();
    const b = await remoteInstance();
    const created = await post(
      a,
      '/api/v1/auth/remote/devices/request',
      { platform: 'ios', label: 'race' },
      bearer(userToken('user-race')),
    );
    const requestId = created.json().data.requestId as string;
    const decisions = await Promise.all([
      post(a, `/api/v1/auth/remote/devices/requests/${requestId}/approve`, {}, bearer(adminToken())),
      post(b, `/api/v1/auth/remote/devices/requests/${requestId}/approve`, {}, bearer(adminToken())),
      post(b, `/api/v1/auth/remote/devices/requests/${requestId}/reject`, {}, bearer(adminToken())),
    ]);
    // approve and reject contend for the same pending row: exactly one decision lands
    expect(decisions.filter((d) => d.statusCode === 200)).toHaveLength(1);
    expect(decisions.filter((d) => d.statusCode === 404)).toHaveLength(2);
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    const credentials = await c.query(
      `SELECT count(*)::int AS n FROM "RemoteClientCredential" WHERE "deviceId" IN
         (SELECT "deviceId" FROM "RemoteClientEnrollmentRequest" WHERE "id"=$1)`,
      [requestId],
    );
    const row = (await c.query(`SELECT "status","decidedBy" FROM "RemoteClientEnrollmentRequest" WHERE "id"=$1`, [
      requestId,
    ])).rows[0];
    expect(row.decidedBy).toBe('admin-1');
    if (row.status === 'approved') expect(credentials.rows[0].n).toBe(1);
    else expect(credentials.rows[0].n).toBe(0);
    await c.end();
    await a.app.close();
    await b.app.close();
  }, 60_000);

  it('stores only digests: neither the credential secret nor any refresh token reaches the database', async () => {
    const a = await remoteInstance();
    const device = await enroll(a);
    const { refreshToken } = (await exchange(a, device)).json().data;
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    for (const table of [
      'RemoteClientCredential',
      'RemoteClientRefreshToken',
      'RemoteClientEnrollmentRequest',
      'RemoteClientAuditEvent',
    ]) {
      const dump = JSON.stringify((await c.query(`SELECT * FROM "${table}"`)).rows);
      expect(dump).not.toContain(device.secret);
      expect(dump).not.toContain(refreshToken);
    }
    const digest = (
      await c.query(`SELECT "secretDigest" FROM "RemoteClientCredential" WHERE "id"=$1`, [device.credentialId])
    ).rows[0].secretDigest as string;
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    await c.end();
    await a.app.close();
  }, 60_000);

  it('reports a database outage instead of pretending to succeed', async () => {
    const sql = createSqlClient(withDb(adminUrl!, 'postgres'), { max: 1, connectionTimeoutMs: 500 });
    const store = createPostgresRemoteClientStore(sql, keys);
    await sql.end();
    await expect(store.ping()).rejects.toThrow();
    await expect(store.listDevices()).rejects.toThrow();
    await expect(store.rotateRefreshToken('irp_rt_x'.padEnd(32, 'x'))).rejects.toThrow();
  });

  it('platform settings (zero-cost mode) are shared by two instances and survive a restart through the API', async () => {
    const t = new Date().toISOString();
    const make = async () => {
      const sql = createSqlClient(url, { max: 4 });
      pools.push(sql);
      const identity = createPostgresIdentityRepositories(sql);
      const mailer = new CapturingEmailSender();
      const app = await buildServer({
        identity,
        mailer,
        remoteClientStore: createPostgresRemoteClientStore(sql, keys),
        settings: createPostgresSettingsStore(sql),
      });
      return { app, identity, sql };
    };
    const a = await make();
    const b = await make();
    await a.identity.users.create({
      id: randomUUID(),
      email: 'zero@example.com',
      name: 'Z',
      passwordHash: hashPassword('Production12345'),
      status: 'active',
      roles: ['member'],
      emailVerifiedAt: t,
      lastLoginAt: null,
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
      permissions: ['runtime.execute'],
    });
    const login = await a.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'zero@example.com', password: 'Production12345' },
      remoteAddress: '10.9.9.1',
    });
    const token = login.json().data.accessToken as string;
    const zero = async (i: { app: FastifyInstance }) =>
      (await i.app.inject({ method: 'GET', url: '/api/v1/platform/zero-cost' })).json().data.enabled;
    expect(await zero(b)).toBe(false);
    const toggled = await a.app.inject({
      method: 'POST',
      url: '/api/v1/platform/zero-cost/toggle',
      headers: bearer(token),
      payload: { enabled: true },
    });
    expect(toggled.statusCode).toBe(200);
    expect(await zero(b)).toBe(true); // the other instance sees it immediately
    await a.app.close();
    await b.app.close();
    const c = await make(); // restart
    expect(await zero(c)).toBe(true);
    await c.app.close();
  }, 60_000);

  it('incident upserts work on real PostgreSQL and survive a restart (regression: unquoted "updatedAt")', async () => {
    const incident = {
      classification: 'primary_failure',
      rootCause: 'DNS resolution degraded',
      affectedComponents: ['dns'],
      evidence: ['dns probe failed'],
      correlationReason: 'Multiple DNS probes failed in the same window.',
      confidence: 0.9,
    };
    const open = async () => {
      const db = createPrismaClient(url);
      return { db, center: new NotificationIncidentCenter(db) };
    };
    const first = await open();
    const created = await first.center.open(incident);
    const again = await first.center.open(incident); // the ON CONFLICT path
    expect(again.id).toBe(created.id);
    expect(again.occurrenceCount).toBe(2);
    await first.db.$disconnect();
    const second = await open();
    const listed = await second.center.listIncidents();
    expect(listed.find((i) => i.id === created.id)?.occurrenceCount).toBe(2);
    expect((await second.center.listNotifications()).length).toBeGreaterThanOrEqual(2);
    await second.db.$disconnect();
  }, 60_000);

  it('the remote-client migration upgrades a database built from the previous schema and is reversible', async () => {
    const upgradeDb = `${dbName}_up`;
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${upgradeDb}`);
    await admin.end();
    const target = withDb(adminUrl!, upgradeDb);
    const previous = migrations.filter((m) => m < REMOTE_MIGRATION);
    await run(target, previous.map(migrationFile));
    const c = new pg.Client({ connectionString: target });
    await c.connect();
    const userId = randomUUID();
    await c.query(
      `INSERT INTO "User" ("id","email","name","passwordHash","status","roles","permissions","createdAt","updatedAt")
       VALUES ($1,'upgrade@example.com','U','x','active',ARRAY['member'],ARRAY[]::text[],now(),now())`,
      [userId],
    );
    expect(
      (await c.query(`SELECT 1 FROM information_schema.tables WHERE table_name='RemoteClientCredential'`)).rowCount,
    ).toBe(0);
    await c.query(readFileSync(migrationFile(REMOTE_MIGRATION), 'utf8')); // upgrade
    for (const t of [
      'RemoteClientCredential',
      'RemoteClientRefreshToken',
      'RemoteClientEnrollmentRequest',
      'RemoteClientAuditEvent',
      'PlatformSetting',
    ])
      expect(
        (await c.query(`SELECT 1 FROM information_schema.tables WHERE table_name=$1`, [t])).rowCount,
      ).toBe(1);
    expect((await c.query(`SELECT 1 FROM "User" WHERE "id"=$1`, [userId])).rowCount).toBe(1); // data intact
    await c.query(readFileSync(join(root, 'rollbacks', `${REMOTE_MIGRATION}.down.sql`), 'utf8')); // rollback
    expect(
      (await c.query(`SELECT 1 FROM information_schema.tables WHERE table_name LIKE 'RemoteClient%'`)).rowCount,
    ).toBe(0);
    expect((await c.query(`SELECT 1 FROM "User" WHERE "id"=$1`, [userId])).rowCount).toBe(1); // still intact
    await c.query(readFileSync(migrationFile(REMOTE_MIGRATION), 'utf8')); // and up again
    expect(
      (await c.query(`SELECT 1 FROM information_schema.tables WHERE table_name='RemoteClientCredential'`)).rowCount,
    ).toBe(1);
    await c.end();
    const cleanup = new pg.Client({ connectionString: adminUrl });
    await cleanup.connect();
    await cleanup.query(`DROP DATABASE IF EXISTS ${upgradeDb} WITH (FORCE)`);
    await cleanup.end();
  }, 60_000);
});
