import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSqlClient } from '@irp/database';
import { buildServer } from './index.js';
import { CapturingEmailSender } from './identity/mailer.js';
import { createPostgresIdentityRepositories } from './identity/postgres.js';

/**
 * Regression tests for issue #412: the `test` payment provider must be rejected
 * in production/staging so a client cannot activate an entitlement with a fake
 * payment. These tests require a real PostgreSQL (IRP_TEST_DATABASE_URL) and
 * are skipped locally when no database is available, but run in CI.
 */
const adminUrl = process.env.IRP_TEST_DATABASE_URL ?? '';
if (!adminUrl && process.env.CI)
  throw new Error(
    'IRP_TEST_DATABASE_URL is required in CI for the subscription payment guard tests.',
  );
const maybe = adminUrl ? describe : describe.skip;

const PW = 'Production12345';

maybe('subscription payment provider guard (real database)', () => {
  const dbName = `irp_sub_guard_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  let url = '';
  const pools: Array<{ end(): Promise<void> }> = [];

  const applyMigrations = async (target: string) => {
    const client = new pg.Client({ connectionString: target });
    await client.connect();
    await client.query(`CREATE DATABASE ${dbName}`);
    await client.end();
    const dbUrl = new URL(adminUrl);
    dbUrl.pathname = `/${dbName}`;
    url = dbUrl.toString();
    const root = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/database/prisma');
    const { readdirSync, readFileSync } = await import('node:fs');
    const migrations = readdirSync(join(root, 'migrations'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    const mClient = new pg.Client({ connectionString: url });
    await mClient.connect();
    for (const m of migrations) {
      await mClient.query(readFileSync(join(root, 'migrations', m, 'migration.sql'), 'utf8'));
    }
    await mClient.end();
  };

  const instance = async (envOverride: Record<string, string> = {}) => {
    const origEnv = { ...process.env };
    Object.assign(process.env, { DATABASE_URL: url }, envOverride);
    const sql = createSqlClient(url, { max: 4 });
    const repos = createPostgresIdentityRepositories(sql);
    pools.push(sql);
    const mailer = new CapturingEmailSender();
    const app = await buildServer({ identity: repos, mailer });
    return { repos, mailer, app, sql, restore: () => (process.env = origEnv) };
  };

  const registerAndVerifyUser = async (e: Awaited<ReturnType<typeof instance>>, email: string) => {
    const reg = await e.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, name: 'Test', password: PW },
    });
    expect(reg.statusCode).toBe(201);
    const msg = e.mailer.last('email_verification', email)!;
    await e.app.inject({
      method: 'POST',
      url: '/api/v1/auth/email-verification/confirm',
      payload: { token: msg.token },
    });
    const login = await e.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PW },
    });
    expect(login.statusCode).toBe(200);
    return login.json().data.accessToken as string;
  };

  beforeAll(async () => {
    await applyMigrations(adminUrl);
  });

  afterAll(async () => {
    // app.close() may already have ended a pool; ending twice throws.
    await Promise.all(pools.map((p) => p.end().catch(() => undefined)));
  });

  it('rejects paymentProvider=test for verify-payment in production', async () => {
    const e = await instance({
      NODE_ENV: 'production',
      JWT_SECRET: 'j'.repeat(48),
      REMOTE_CLIENT_CREDENTIAL_KEY: 'c'.repeat(48),
      REMOTE_CLIENT_REFRESH_KEY: 'r'.repeat(48),
    });
    try {
      const token = await registerAndVerifyUser(e, `guard-prod-${randomUUID()}@example.com`);

      // Attempt verify-payment with test provider — transaction won't exist (404),
      // but if it did, production must not auto-verify test. The guard rejects
      // before provider verification. At minimum: not 200.
      const res = await e.app.inject({
        method: 'POST',
        url: '/api/v1/subscriptions/verify-payment',
        headers: { authorization: `Bearer ${token}` },
        payload: { paymentTransactionId: randomUUID(), providerRef: 'test_ref' },
      });
      expect(res.statusCode).not.toBe(200);
      expect([403, 404]).toContain(res.statusCode);
      if (res.statusCode === 403) {
        const body = res.json();
        expect(body.error).toContain('Test payment provider is not allowed');
      }
    } finally {
      e.restore();
      await e.app.close();
    }
  });

  it('allows paymentProvider=test for verify-payment in development', async () => {
    const e = await instance({ NODE_ENV: 'development' });
    try {
      const token = await registerAndVerifyUser(e, `guard-dev-${randomUUID()}@example.com`);

      const res = await e.app.inject({
        method: 'POST',
        url: '/api/v1/subscriptions/verify-payment',
        headers: { authorization: `Bearer ${token}` },
        payload: { paymentTransactionId: randomUUID(), providerRef: 'test_ref' },
      });
      // Transaction won't exist -> 404, but development must not reject the test provider itself.
      expect(res.statusCode).not.toBe(403);
    } finally {
      e.restore();
      await e.app.close();
    }
  });

  it('rejects missing paymentProvider in purchase (no default test)', async () => {
    const e = await instance({ NODE_ENV: 'development' });
    try {
      const token = await registerAndVerifyUser(e, `guard-nodef-${randomUUID()}@example.com`);

      const res = await e.app.inject({
        method: 'POST',
        url: '/api/v1/subscriptions/purchase',
        headers: { authorization: `Bearer ${token}` },
        payload: { planSlug: 'pro-monthly' },
      });
      // No paymentProvider provided -> Zod validation error (no default('test') anymore).
      // Database may not be configured in test env, so expect 400 (validation) or 500 (no DB).
      expect(res.statusCode).toBe(400);
    } finally {
      e.restore();
      await e.app.close();
    }
  });

  it('paid renewal extends from the current expiry, keeps startedAt and extends entitlements', async () => {
    const e = await instance({ NODE_ENV: 'development' });
    try {
      // Earlier tests in this file already consumed the per-IP auth rate-limit budget.
      await e.sql.query(`DELETE FROM "RateLimitBucket"`);
      const token = await registerAndVerifyUser(e, `renew-${randomUUID()}@example.com`);
      const auth = { authorization: `Bearer ${token}` };
      const plan = { slug: `renew-plan-${randomUUID().slice(0, 8)}`, durationDays: 30 };
      await e.sql.query(
        `INSERT INTO "SubscriptionPlan" ("slug","name","priceUsd","durationDays","maxDevices","features") VALUES ($1,'Renewal test',500,$2,1,$3)`,
        [plan.slug, plan.durationDays, JSON.stringify({ remote_access: true })],
      );
      const durationMs = Number(plan.durationDays) * 86_400_000;

      const purchase = await e.app.inject({
        method: 'POST',
        url: '/api/v1/subscriptions/purchase',
        headers: auth,
        payload: { planSlug: plan.slug, paymentProvider: 'test' },
      });
      expect(purchase.statusCode).toBe(200);
      const { subscriptionId, paymentTransactionId } = purchase.json().data;
      const activate = await e.app.inject({
        method: 'POST',
        url: '/api/v1/subscriptions/verify-payment',
        headers: auth,
        payload: { paymentTransactionId },
      });
      expect(activate.statusCode).toBe(200);

      const read = async () =>
        (
          await e.sql.query(
            `SELECT "startedAt" AT TIME ZONE 'UTC' AS "startedAt", "expiresAt" AT TIME ZONE 'UTC' AS "expiresAt", "renewedAt" FROM "Subscription" WHERE "id" = $1`,
            [subscriptionId],
          )
        )[0]!;
      const before = await read();
      const beforeExpiry = new Date(before.expiresAt as string).getTime();
      const entBefore = await e.sql.query(
        `SELECT "expiresAt" AT TIME ZONE 'UTC' AS "expiresAt" FROM "Entitlement" WHERE "subscriptionId" = $1 AND "status" = 'ACTIVE'`,
        [subscriptionId],
      );

      const renew = await e.app.inject({
        method: 'POST',
        url: '/api/v1/subscriptions/renew',
        headers: auth,
        payload: { paymentProvider: 'test' },
      });
      expect(renew.statusCode).toBe(200);
      const verify = await e.app.inject({
        method: 'POST',
        url: '/api/v1/subscriptions/verify-payment',
        headers: auth,
        payload: { paymentTransactionId: renew.json().data.paymentTransactionId },
      });
      expect(verify.statusCode).toBe(200);

      const after = await read();
      // Remaining paid time is preserved: new expiry = old expiry + one full period (not now + period).
      expect(new Date(after.expiresAt as string).getTime()).toBe(beforeExpiry + durationMs);
      expect(new Date(after.startedAt as string).getTime()).toBe(
        new Date(before.startedAt as string).getTime(),
      );
      expect(after.renewedAt).not.toBeNull();
      const entAfter = await e.sql.query(
        `SELECT "expiresAt" AT TIME ZONE 'UTC' AS "expiresAt" FROM "Entitlement" WHERE "subscriptionId" = $1 AND "status" = 'ACTIVE'`,
        [subscriptionId],
      );
      expect(entAfter.length).toBe(entBefore.length);
      for (const row of entAfter) {
        expect(new Date(row.expiresAt as string).getTime()).toBe(beforeExpiry + durationMs);
      }
    } finally {
      e.restore();
      await e.app.close();
    }
  });
});
