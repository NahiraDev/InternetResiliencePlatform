import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSqlClient } from '@irp/database';
import { createMemoryIdentityRepositories } from './memory.js';
import { createPostgresIdentityRepositories } from './postgres.js';
import { resolveRetention, startRetentionJob } from './retention.js';
import type { IdentityRepositories, RetentionPolicy } from './types.js';

const DAY = 86_400_000;
const NOW = new Date('2026-11-17T00:00:00.000Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();
const policy: RetentionPolicy = { graceMs: 7 * DAY, auditRetentionMs: 90 * DAY };

const scenario = (make: () => Promise<IdentityRepositories>) => {
  it('removes only data that is expired beyond the grace period, and keeps everything still useful', async () => {
    const repos = await make();
    const userId = randomUUID();
    await repos.users.create({
      id: userId,
      email: `${userId}@example.test`,
      name: 'U',
      passwordHash: 'x',
      status: 'active',
      roles: [],
      permissions: [],
      emailVerifiedAt: null,
      lastLoginAt: null,
      createdAt: at(-400),
      updatedAt: at(-400),
      deletedAt: null,
    });
    const session = (days: number, revoked: string | null = null) => {
      const id = randomUUID();
      return {
        id,
        userId,
        familyId: randomUUID(),
        refreshTokenHash: `h-${id}`,
        expiresAt: at(days),
        revokedAt: revoked,
        createdAt: at(-30),
      };
    };
    const oldExpired = session(-10);
    const recentlyExpired = session(-3);
    const live = session(10);
    const oldButRevokedLive = session(10, at(-20)); // revoked, but its refresh token is still valid → keep for reuse detection
    for (const s of [oldExpired, recentlyExpired, live, oldButRevokedLive])
      await repos.sessions.create(s);

    const token = (type: 'email_verification' | 'password_reset', days: number) => ({
      id: randomUUID(),
      userId,
      type,
      tokenHash: `t-${randomUUID()}`,
      expiresAt: at(days),
      consumedAt: null,
      createdAt: at(-30),
    });
    await repos.tokens.issue(token('email_verification', -10));
    await repos.tokens.issue(token('password_reset', 1));

    const result = await repos.retention.purgeExpired(policy, NOW);
    expect(result.sessions).toBe(1);
    expect(result.tokens).toBe(1);

    expect(await repos.sessions.findByRefreshHash(oldExpired.refreshTokenHash)).toBeNull();
    for (const s of [recentlyExpired, live, oldButRevokedLive]) {
      expect(await repos.sessions.findByRefreshHash(s.refreshTokenHash)).not.toBeNull();
    }
    // Idempotent: a second run finds nothing more to delete.
    expect(await repos.retention.purgeExpired(policy, NOW)).toEqual({
      sessions: 0,
      tokens: 0,
      rateLimitBuckets: 0,
      auditLogs: 0,
    });
    await repos.close();
  });

  it('keeps audit logs forever unless a retention period is configured', async () => {
    const repos = await make();
    await repos.audit.record({ action: 'test.audit', resource: 'x' });
    const future = new Date(NOW.getTime() + 3650 * DAY);
    expect(
      (await repos.retention.purgeExpired({ graceMs: DAY, auditRetentionMs: null }, future))
        .auditLogs,
    ).toBe(0);
    expect((await repos.audit.list({ action: 'test.audit' })).length).toBe(1);
    expect(
      (await repos.retention.purgeExpired({ graceMs: DAY, auditRetentionMs: 30 * DAY }, future))
        .auditLogs,
    ).toBe(1);
    expect((await repos.audit.list({ action: 'test.audit' })).length).toBe(0);
    await repos.close();
  });

  it('purges rate-limit buckets whose window has ended but not active ones', async () => {
    const repos = await make();
    await repos.rateLimits.hit('rl:retention:expired', 5, 1_000);
    await repos.rateLimits.hit('rl:retention:active', 5, 3_600_000);
    const later = new Date(Date.now() + 60_000);
    expect(
      (await repos.retention.purgeExpired({ graceMs: DAY, auditRetentionMs: null }, later))
        .rateLimitBuckets,
    ).toBeGreaterThanOrEqual(1);
    expect(await repos.rateLimits.peek('rl:retention:active')).not.toBeNull();
    await repos.close();
  });
};

describe('retention (in-memory store)', () => {
  scenario(async () => createMemoryIdentityRepositories());
});

const adminUrl = process.env.IRP_TEST_DATABASE_URL;
if (!adminUrl && process.env.CI)
  throw new Error('IRP_TEST_DATABASE_URL is required in CI for the PostgreSQL integration tests.');
const maybe = adminUrl ? describe : describe.skip;
const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../packages/database/prisma');

maybe('retention (real PostgreSQL)', () => {
  const dbName = `irp_rt_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const withDb = (db: string) => {
    const u = new URL(adminUrl ?? '');
    u.pathname = `/${db}`;
    return u.toString();
  };
  const pools: Array<{ end(): Promise<void> }> = [];

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    await admin.end();
    const c = new pg.Client({ connectionString: withDb(dbName) });
    await c.connect();
    for (const m of readdirSync(join(root, 'migrations'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()) {
      await c.query(readFileSync(join(root, 'migrations', m, 'migration.sql'), 'utf8'));
    }
    await c.end();
  }, 60_000);

  afterAll(async () => {
    await Promise.allSettled(pools.map((p) => p.end()));
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end();
  }, 60_000);

  scenario(async () => {
    const sql = createSqlClient(withDb(dbName), { max: 2 });
    pools.push(sql);
    return createPostgresIdentityRepositories(sql);
  });
});

describe('resolveRetention / startRetentionJob', () => {
  it('has safe defaults: 7-day grace, audit kept forever, hourly', () => {
    expect(resolveRetention({})).toEqual({
      policy: { graceMs: 7 * DAY, auditRetentionMs: null },
      intervalMs: 3_600_000,
    });
  });
  it('reads overrides and rejects invalid values', () => {
    expect(
      resolveRetention({
        IRP_RETENTION_GRACE_DAYS: '2',
        IRP_AUDIT_RETENTION_DAYS: '365',
        IRP_RETENTION_INTERVAL_MINUTES: '0',
      }),
    ).toEqual({
      policy: { graceMs: 2 * DAY, auditRetentionMs: 365 * DAY },
      intervalMs: 0,
    });
    expect(() => resolveRetention({ IRP_RETENTION_GRACE_DAYS: '0' })).toThrow();
    expect(() => resolveRetention({ IRP_AUDIT_RETENTION_DAYS: 'abc' })).toThrow();
    expect(() => resolveRetention({ IRP_RETENTION_INTERVAL_MINUTES: '-5' })).toThrow();
  });
  it('logs and survives a failing purge, and does not overlap runs', async () => {
    const log = vi.fn();
    const purge = vi.fn().mockRejectedValueOnce(new Error('db down'));
    const job = startRetentionJob(
      { retention: { purgeExpired: purge } },
      { policy, intervalMs: 0 },
      log,
    );
    expect(await job.runOnce()).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('db down'));
    purge.mockResolvedValueOnce({ sessions: 1, tokens: 0, rateLimitBuckets: 0, auditLogs: 0 });
    expect((await job.runOnce())?.sessions).toBe(1);
  });
});
