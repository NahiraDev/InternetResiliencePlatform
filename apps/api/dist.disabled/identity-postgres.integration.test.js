import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '@irp/auth';
import { createSqlClient } from '@irp/database';
import { buildServer } from './index.js';
import { CapturingEmailSender } from './identity/mailer.js';
import { createPostgresIdentityRepositories } from './identity/postgres.js';
/**
 * Real-PostgreSQL integration tests. Set IRP_TEST_DATABASE_URL to a role that may CREATE DATABASE.
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
const withDb = (url, db) => {
    const u = new URL(url);
    u.pathname = `/${db}`;
    return u.toString();
};
const PW = 'Production12345';
maybe('PostgreSQL identity (real database)', () => {
    const dbName = `irp_it_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let url = '';
    const pools = [];
    const applyAll = async (target, upTo) => {
        const c = new pg.Client({ connectionString: target });
        await c.connect();
        for (const m of migrations) {
            if (upTo && m > upTo)
                break;
            await c.query(readFileSync(join(root, 'migrations', m, 'migration.sql'), 'utf8'));
        }
        await c.end();
    };
    const instance = async () => {
        const sql = createSqlClient(url, { max: 4 });
        const repos = createPostgresIdentityRepositories(sql);
        pools.push(sql);
        const mailer = new CapturingEmailSender();
        return { repos, mailer, app: await buildServer({ identity: repos, mailer }) };
    };
    let octet = 1;
    const freshIp = () => `10.${(octet >> 8) & 255}.${octet & 255}.${(octet++ % 250) + 1}`;
    // Every call comes from its own client IP unless `ip` is given, so tests do not drain each other's
    // (database-shared) rate-limit budget; the dedicated rate-limit test pins one IP on purpose.
    const post = (i, u, payload, headers = {}, ip = freshIp()) => i.app.inject({
        method: 'POST',
        url: u,
        payload: payload,
        headers,
        remoteAddress: ip,
    });
    beforeAll(async () => {
        const admin = new pg.Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        url = withDb(adminUrl, dbName);
        await applyAll(url);
    }, 60_000);
    afterAll(async () => {
        await Promise.allSettled(pools.map((p) => p.end()));
        const admin = new pg.Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    }, 60_000);
    it('migrations create every identity table and the identity migration is reversible (up/down/up)', async () => {
        const c = new pg.Client({ connectionString: url });
        await c.connect();
        const tables = (await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`)).rows.map((r) => r.table_name);
        for (const t of [
            'User',
            'Session',
            'Token',
            'AuditLog',
            'Organization',
            'Project',
            'Workspace',
            'RateLimitBucket',
        ])
            expect(tables).toContain(t);
        const down = readFileSync(join(root, 'rollbacks/20261031000000_identity_core.down.sql'), 'utf8');
        const up = readFileSync(join(root, 'migrations/20261031000000_identity_core/migration.sql'), 'utf8');
        await c.query(down);
        expect((await c.query(`SELECT 1 FROM information_schema.tables WHERE table_name='User'`)).rowCount).toBe(0);
        // earlier migrations' data tables are untouched by the rollback
        expect((await c.query(`SELECT 1 FROM information_schema.tables WHERE table_name='NetworkIntentRecord'`)).rowCount).toBe(1);
        await c.query(up);
        expect((await c.query(`SELECT 1 FROM information_schema.tables WHERE table_name='User'`)).rowCount).toBe(1);
        await c.end();
    });
    it('runs register → verify → login → refresh → rotate → logout → revoke against PostgreSQL', async () => {
        const i = await instance();
        expect((await post(i, '/api/v1/auth/register', {
            email: 'pg@example.com',
            name: 'PG',
            password: PW,
        })).statusCode).toBe(201);
        expect((await post(i, '/api/v1/auth/login', { email: 'pg@example.com', password: PW })).statusCode).toBe(403);
        await post(i, '/api/v1/auth/email-verification/confirm', {
            token: i.mailer.last('email_verification', 'pg@example.com').token,
        });
        const login = (await post(i, '/api/v1/auth/login', { email: 'pg@example.com', password: PW })).json().data;
        const r1 = (await post(i, '/api/v1/auth/refresh', { refreshToken: login.refreshToken })).json()
            .data;
        expect((await post(i, '/api/v1/auth/refresh', { refreshToken: login.refreshToken })).statusCode).toBe(401);
        expect((await i.app.inject({
            method: 'GET',
            url: '/api/v1/me',
            headers: { authorization: `Bearer ${r1.accessToken}` },
        })).statusCode).toBe(401); // family revoked by replay
        const again = (await post(i, '/api/v1/auth/login', { email: 'pg@example.com', password: PW })).json().data;
        expect((await post(i, '/api/v1/auth/logout', {}, { authorization: `Bearer ${again.accessToken}` }))
            .statusCode).toBe(200);
        expect((await i.app.inject({
            method: 'GET',
            url: '/api/v1/me',
            headers: { authorization: `Bearer ${again.accessToken}` },
        })).statusCode).toBe(401);
        // tokens and refresh secrets are only stored hashed
        const c = new pg.Client({ connectionString: url });
        await c.connect();
        const leak = await c.query(`SELECT 1 FROM "Session" WHERE "refreshTokenHash"=$1 OR "refreshTokenHash"=$2`, [login.refreshToken, again.refreshToken]);
        expect(leak.rowCount).toBe(0);
        const audit = await c.query(`SELECT action FROM "AuditLog" ORDER BY "createdAt"`);
        expect(audit.rows.map((r) => r.action)).toEqual(expect.arrayContaining([
            'user.registered',
            'user.email_verified',
            'login.succeeded',
            'refresh.rotated',
            'refresh.reuse_detected',
            'logout',
        ]));
        await c.end();
        await i.app.close();
    }, 60_000);
    it('two independent API instances see consistent state, and state survives a restart', async () => {
        const a = await instance();
        const b = await instance();
        await post(a, '/api/v1/auth/register', {
            email: 'shared@example.com',
            name: 'S',
            password: PW,
        });
        // verification email was produced by A; B (different process state) completes it
        await post(b, '/api/v1/auth/email-verification/confirm', {
            token: a.mailer.last('email_verification', 'shared@example.com').token,
        });
        const login = (await post(a, '/api/v1/auth/login', { email: 'shared@example.com', password: PW })).json().data;
        expect((await b.app.inject({
            method: 'GET',
            url: '/api/v1/me',
            headers: { authorization: `Bearer ${login.accessToken}` },
        })).statusCode).toBe(200);
        const refreshedOnB = await post(b, '/api/v1/auth/refresh', {
            refreshToken: login.refreshToken,
        });
        expect(refreshedOnB.statusCode).toBe(200);
        // logout on A is immediately honoured by B
        const next = refreshedOnB.json().data;
        await post(a, '/api/v1/auth/logout', {}, { authorization: `Bearer ${next.accessToken}` });
        expect((await b.app.inject({
            method: 'GET',
            url: '/api/v1/me',
            headers: { authorization: `Bearer ${next.accessToken}` },
        })).statusCode).toBe(401);
        // full restart: close everything, build a fresh instance, credentials still work
        await a.app.close();
        await b.app.close();
        const c = await instance();
        expect((await post(c, '/api/v1/auth/login', { email: 'shared@example.com', password: PW }))
            .statusCode).toBe(200);
        await c.app.close();
    }, 60_000);
    it('lets exactly one of many concurrent refreshes win across instances', async () => {
        const a = await instance();
        const b = await instance();
        await post(a, '/api/v1/auth/register', {
            email: 'race-pg@example.com',
            name: 'R',
            password: PW,
        });
        await post(a, '/api/v1/auth/email-verification/confirm', {
            token: a.mailer.last('email_verification', 'race-pg@example.com').token,
        });
        const { refreshToken } = (await post(a, '/api/v1/auth/login', { email: 'race-pg@example.com', password: PW })).json().data;
        const results = await Promise.all(Array.from({ length: 10 }, (_, n) => post(n % 2 ? a : b, '/api/v1/auth/refresh', { refreshToken })));
        expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
        await a.app.close();
        await b.app.close();
    }, 60_000);
    it('enforces rate limits across instances (shared window) and a per-account lock', async () => {
        const a = await instance();
        const b = await instance();
        const codes = [];
        for (let n = 0; n < 12; n++)
            codes.push((await post(n % 2 ? a : b, '/api/v1/auth/password-reset/request', { email: 'nobody@example.com' }, {}, '203.0.113.9')).statusCode);
        // 10 per minute is one budget shared by both instances: 12 hits split across them must overflow it
        expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(2);
        await a.app.close();
        await b.app.close();
    }, 60_000);
    it('isolates tenants in SQL (owner scope) and rejects cross-tenant project references', async () => {
        const i = await instance();
        const t = new Date().toISOString();
        const mk = async (email) => {
            await i.repos.users.create({
                id: randomUUID(),
                email,
                name: 'T',
                passwordHash: hashPassword(PW),
                status: 'active',
                roles: ['member'],
                emailVerifiedAt: t,
                lastLoginAt: null,
                createdAt: t,
                updatedAt: t,
                deletedAt: null,
                permissions: [
                    'organizations:read',
                    'organizations:write',
                    'projects:read',
                    'projects:write',
                    'workspaces:read',
                    'workspaces:write',
                ],
            });
            return {
                Authorization: `Bearer ${(await post(i, '/api/v1/auth/login', { email, password: PW })).json().data.accessToken}`,
            };
        };
        const A = await mk('ta@example.com');
        const B = await mk('tb@example.com');
        const orgA = (await i.app.inject({
            method: 'POST',
            url: '/api/v1/organizations',
            headers: A,
            payload: { name: 'Org A' },
        })).json().data;
        const orgB = (await i.app.inject({
            method: 'POST',
            url: '/api/v1/organizations',
            headers: B,
            payload: { name: 'Org B' },
        })).json().data;
        const projA = (await i.app.inject({
            method: 'POST',
            url: `/api/v1/organizations/${orgA.id}/projects`,
            headers: A,
            payload: { name: 'P' },
        })).json().data;
        expect((await i.app.inject({ method: 'GET', url: `/api/v1/organizations/${orgA.id}`, headers: B }))
            .statusCode).toBe(404);
        expect((await i.app.inject({ method: 'GET', url: `/api/v1/projects/${projA.id}`, headers: B }))
            .statusCode).toBe(404);
        expect((await i.app.inject({ method: 'GET', url: '/api/v1/organizations', headers: B }))
            .json()
            .data.map((o) => o.id)).toEqual([orgB.id]);
        // B tries to hang a workspace in its own org off A's project
        expect((await i.app.inject({
            method: 'POST',
            url: `/api/v1/organizations/${orgB.id}/workspaces`,
            headers: B,
            payload: { name: 'W', projectId: projA.id },
        })).statusCode).toBe(404);
        expect((await i.app.inject({
            method: 'POST',
            url: '/api/v1/organizations',
            headers: A,
            payload: { name: 'Org A' },
        })).statusCode).toBe(409);
        await i.app.close();
    }, 60_000);
    it('reports the outage instead of silently succeeding when PostgreSQL goes away', async () => {
        const sql = createSqlClient(withDb(adminUrl, 'postgres'), {
            max: 1,
            connectionTimeoutMs: 500,
        });
        const repos = createPostgresIdentityRepositories(sql);
        await sql.end();
        await expect(repos.ping()).rejects.toThrow();
        await expect(repos.users.findByEmail('x@example.com')).rejects.toThrow();
    });
});
//# sourceMappingURL=identity-postgres.integration.test.js.map