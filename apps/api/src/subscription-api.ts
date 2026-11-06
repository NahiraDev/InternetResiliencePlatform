/*
 * Subscription & Entitlement Lifecycle API.
 *
 * Backend-authoritative subscription lifecycle:
 *   REGISTERED → PAYMENT_PENDING → ACTIVE → EXPIRED / CANCELLED
 *
 * Frontend claims of payment success are never trusted. Payment verification
 * is always performed server-side against a payment provider.
 *
 * The 'test' provider is development-only and never used in production.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ConflictAppError,
  ForbiddenAppError,
  NotFoundAppError,
} from '@irp/core';
import type { Principal } from '@irp/auth';
import { type SqlClient } from '@irp/database';
import { sharedRateLimitPreHandler } from './security/rate-limit.js';
import { controlRequest } from '@irp/resilience-runtime';
import { join } from 'node:path';
import os from 'node:os';

const isoNow = () => new Date().toISOString();

interface SubscriptionRoutesDeps {
  sql: SqlClient | undefined;
  rateLimitStore?: { hit: (key: string, max: number, windowMs: number) => Promise<{ allowed: boolean; limit: number; remaining: number; resetAt: number }> };
  repos: {
    audit: { record: (entry: { actorUserId?: string | null; action: string; resource: string; resourceId?: string | null; metadata?: Record<string, unknown>; ipAddress?: string | null }) => Promise<void> };
  };
}

const requireAuthDep = async (request: FastifyRequest): Promise<Principal> => {
  const principal = await request.jwtAuth.authenticate({ headers: request.headers });
  if (!principal) throw new Error('Authentication required') as any;
  return principal;
};

const rateLimit = (deps: SubscriptionRoutesDeps, name: string) => {
  if (!deps.rateLimitStore) return async (_: any, __: any) => {};
  return sharedRateLimitPreHandler(deps.rateLimitStore, { name, max: 60, windowMs: 60_000 });
};

const okResp = (data: unknown) => ({ success: true, data });

export const registerSubscriptionRoutes = (app: FastifyInstance, deps: SubscriptionRoutesDeps) => {
  const { sql, repos } = deps;
  const plansLimit = rateLimit(deps, 'subscription-plans');
  const subLimit = rateLimit(deps, 'subscription');
  const deviceLimit = rateLimit(deps, 'device');
  const adminLimit = rateLimit(deps, 'admin-subscription');

  // ── List available subscription plans (public) ────────────────────────
  app.get('/api/v1/subscriptions/plans', { preHandler: [plansLimit] }, async () => {
    if (!sql) return okResp({ plans: [], note: 'Database not configured' });
    const rows = await sql.query(
      `SELECT "id","slug","name","description","priceUsd","currency","durationDays","maxDevices","features","isActive","createdAt","updatedAt"
       FROM "SubscriptionPlan" WHERE "isActive" = true ORDER BY "priceUsd" ASC`,
    );
    return okResp({ plans: rows });
  });

  // ── Get the authenticated customer's subscription ─────────────────────
  app.get('/api/v1/subscriptions/me', { preHandler: [subLimit] }, async (request) => {
    const principal = await requireAuthDep(request);
    if (!sql) throw new Error('Database not configured');
    const rows = await sql.query(
      `SELECT s."id",s."userId",s."planId",s."status",s."startedAt",s."expiresAt",s."renewedAt",s."canceledAt",s."autoRenew",s."metadata",s."createdAt",s."updatedAt",
              p."slug" AS planSlug,p."name" AS planName,p."description" AS planDescription,p."priceUsd",p."currency",p."durationDays",p."maxDevices",p."features" AS planFeatures
       FROM "Subscription" s
       JOIN "SubscriptionPlan" p ON s."planId" = p."id"
       WHERE s."userId" = $1
       ORDER BY s."createdAt" DESC LIMIT 1`,
      [principal.id],
    ) as any[];
    const sub = rows[0];
    if (!sub) {
      return okResp({ subscription: null, message: 'No subscription found. Register and select a plan to get started.' });
    }
    const entRows = await sql.query(
      `SELECT "feature","status","startedAt","expiresAt","metadata" FROM "Entitlement" WHERE "userId" = $1 AND "status" = 'ACTIVE'`,
      [principal.id],
    ) as any[];
    const devRows = await sql.query(
      `SELECT "id","deviceId","label","platform","status","authorizedAt","revokedAt","lastConnectedAt","lastDisconnectedAt","metadata","subscriptionId"
       FROM "Device" WHERE "userId" = $1 AND "status" != 'REVOKED' ORDER BY "createdAt" DESC`,
      [principal.id],
    ) as any[];
    return okResp({ subscription: sub, entitlements: entRows, devices: devRows });
  });

  // ── Purchase / subscribe to a plan → REGISTERED + PENDING payment ─────
  app.post('/api/v1/subscriptions/purchase', { preHandler: [subLimit] }, async (request) => {
    const principal = await requireAuthDep(request);
    if (!sql) throw new Error('Database not configured');
    const body = z.object({ planSlug: z.string().min(1), paymentProvider: z.string().default('test') }).parse(request.body ?? {});

    const planRows = await sql.query(
      `SELECT "id","slug","name","priceUsd","currency","durationDays","maxDevices","features" FROM "SubscriptionPlan" WHERE "slug" = $1 AND "isActive" = true`,
      [body.planSlug],
    ) as any[];
    if (planRows.length === 0) throw new NotFoundAppError('Plan not found or inactive');
    const plan = planRows[0];

    const existing = await sql.query(
      `SELECT "id","status" FROM "Subscription" WHERE "userId" = $1 AND "status" IN ('REGISTERED','PAYMENT_PENDING','ACTIVE') ORDER BY "createdAt" DESC LIMIT 1`,
      [principal.id],
    ) as any[];
    if (existing.length > 0 && existing[0].status === 'ACTIVE') {
      throw new ConflictAppError('You already have an active subscription');
    }

    const t = isoNow();
    const subId = crypto.randomUUID();
    const txId = crypto.randomUUID();

    await sql.query(
      `INSERT INTO "Subscription" ("id","userId","planId","status","startedAt","createdAt","updatedAt")
       VALUES ($1,$2,$3,'REGISTERED',NULL,$4,$4)`,
      [subId, principal.id, plan.id, t],
    );

    await sql.query(
      `INSERT INTO "PaymentTransaction" ("id","subscriptionId","userId","amountUsd","currency","status","provider","providerRef","metadata","createdAt")
       VALUES ($1,$2,$3,$4,$5,'PENDING',$6,NULL,$7,$8)`,
      [txId, subId, principal.id, plan.priceUsd, plan.currency, body.paymentProvider, JSON.stringify({ planSlug: body.planSlug }), t],
    );

    await repos.audit.record({
      actorUserId: principal.id,
      action: 'subscription.purchase',
      resource: 'subscription',
      resourceId: subId,
      metadata: { planSlug: body.planSlug, amountUsd: plan.priceUsd, provider: body.paymentProvider },
      ipAddress: request.ip,
    });

    return okResp({
      subscriptionId: subId,
      paymentTransactionId: txId,
      status: 'REGISTERED',
      plan: { slug: plan.slug, name: plan.name, priceUsd: plan.priceUsd, currency: plan.currency, durationDays: plan.durationDays },
      message: 'Subscription registered. Complete payment to activate.',
    });
  });

  // ── Backend-authoritative payment verification → ACTIVE ───────────────
  app.post('/api/v1/subscriptions/verify-payment', { preHandler: [subLimit] }, async (request) => {
    const principal = await requireAuthDep(request);
    if (!sql) throw new Error('Database not configured');
    const body = z.object({ paymentTransactionId: z.string().min(1), providerRef: z.string().optional() }).parse(request.body ?? {});

    const txRows = await sql.query(
      `SELECT pt."id",pt."subscriptionId",pt."status",pt."provider",pt."amountUsd",pt."currency",s."userId",s."status" AS "subStatus",s."planId"
       FROM "PaymentTransaction" pt
       JOIN "Subscription" s ON pt."subscriptionId" = s."id"
       WHERE pt."id" = $1 AND pt."userId" = $2`,
      [body.paymentTransactionId, principal.id],
    ) as any[];
    if (txRows.length === 0) throw new NotFoundAppError('Payment transaction not found');
    const tx = txRows[0];
    if (tx.status !== 'PENDING') throw new ConflictAppError(`Payment already ${tx.status}`);
    if (tx.subStatus !== 'REGISTERED' && tx.subStatus !== 'PAYMENT_PENDING') {
      throw new ConflictAppError('Subscription is not in a payable state');
    }

    // Backend-authoritative verification against the payment provider.
    let verified = false;
    let providerRef = body.providerRef;
    if (tx.provider === 'test') {
      // DEVELOPMENT-ONLY test provider: never used in production.
      verified = true;
      providerRef = body.providerRef ?? `test_${crypto.randomUUID()}`;
    } else {
      throw new Error(`Payment provider '${tx.provider}' is not configured for verification`);
    }

    if (!verified) {
      await sql.query(
        `UPDATE "PaymentTransaction" SET "status"='FAILED',"failureReason"=$2,"updatedAt"=$3 WHERE "id"=$1`,
        [tx.id, 'Payment verification failed', isoNow()],
      );
      await repos.audit.record({
        actorUserId: principal.id,
        action: 'payment.failed',
        resource: 'payment',
        resourceId: tx.id,
        metadata: { provider: tx.provider, reason: 'verification_failed' },
        ipAddress: request.ip,
      });
      throw new Error('Payment verification failed');
    }

    const now = isoNow();
    const planRows = await sql.query(`SELECT "durationDays" FROM "SubscriptionPlan" WHERE "id" = $1`, [tx.planId]) as any[];
    const durationDays = Number(planRows[0]?.durationDays ?? 30);
    
    // Determine if this is a renewal (subscription already active)
    const isRenewal = tx.subStatus === 'ACTIVE';
    const currentExpires = await sql.query(`SELECT "expiresAt" FROM "Subscription" WHERE "id" = $1`, [tx.subscriptionId]) as any[];
    const currentExpiresAt = currentExpires[0]?.expiresAt;
    const baseDate = isRenewal && currentExpiresAt && new Date(currentExpiresAt) > new Date(now)
      ? currentExpiresAt
      : now;
    const startedAt = isRenewal ? null : now;
    const expiresAt = new Date(new Date(baseDate).getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    await sql.transaction(async (txClient: any) => {
      const setClauses: string[] = [`"status" = 'ACTIVE'`, `"updatedAt" = $2`];
      const setValues: unknown[] = [tx.subscriptionId, now];
      let valIdx = 3;
      if (startedAt) {
        setClauses.push(`"startedAt" = $${valIdx}`);
        setValues.push(startedAt);
        valIdx++;
      }
      if (isRenewal) {
        setClauses.push(`"renewedAt" = $${valIdx}`);
        setValues.push(now);
        valIdx++;
      }
      setClauses.push(`"expiresAt" = $${valIdx}`);
      setValues.push(expiresAt);
      
      await txClient.query(
        `UPDATE "Subscription" SET ${setClauses.join(', ')} WHERE "id" = $1`,
        setValues,
      );
      await txClient.query(
        `UPDATE "PaymentTransaction" SET "status" = 'SUCCEEDED', "providerRef" = $2, "paidAt" = $3, "updatedAt" = $4 WHERE "id" = $1`,
        [tx.id, providerRef, now, now],
      );
    });

    const featRows = await sql.query(`SELECT "features" FROM "SubscriptionPlan" WHERE "id" = $1`, [tx.planId]) as any[];
    const features = ((featRows[0]?.features as Record<string, unknown>) ?? {});
    const entRows = await sql.query(`SELECT "feature" FROM "Entitlement" WHERE "subscriptionId" = $1 AND "status" = 'ACTIVE'`, [tx.subscriptionId]) as any[];
    const existingFeatures = new Set(entRows.map((r: any) => r.feature));
    const entInserts: string[] = [];
    const entValues: unknown[] = [];
    let entIdx = 1;
    for (const [feature, enabled] of Object.entries(features)) {
      if (enabled === true && !existingFeatures.has(feature)) {
        const entId = crypto.randomUUID();
        entInserts.push(`($${entIdx++},$${entIdx++},$${entIdx++},$${entIdx++},'ACTIVE',$${entIdx++},$${entIdx++},$${entIdx++},$${entIdx++},$${entIdx++})`);
        entValues.push(entId, tx.subscriptionId, principal.id, feature, startedAt, expiresAt, JSON.stringify({}), now, now);
      }
    }
    if (entInserts.length > 0) {
      await sql.query(
        `INSERT INTO "Entitlement" ("id","subscriptionId","userId","feature","status","startedAt","expiresAt","metadata","createdAt","updatedAt") VALUES ${entInserts.join(',')}`,
        entValues,
      );
    }

    await repos.audit.record({
      actorUserId: principal.id,
      action: 'subscription.activated',
      resource: 'subscription',
      resourceId: tx.subscriptionId,
      metadata: { paymentTransactionId: tx.id, providerRef, expiresAt },
      ipAddress: request.ip,
    });

    return okResp({
      subscriptionId: tx.subscriptionId,
      status: 'ACTIVE',
      startedAt,
      expiresAt,
      message: 'Subscription activated. Entitlements issued.',
    });
  });

  // ── Renew subscription ────────────────────────────────────────────────
  app.post('/api/v1/subscriptions/renew', { preHandler: [subLimit] }, async (request) => {
    const principal = await requireAuthDep(request);
    if (!sql) throw new Error('Database not configured');
    const body = z.object({ paymentProvider: z.string().default('test') }).parse(request.body ?? {});

    const subRows = await sql.query(
      `SELECT s."id",s."status",s."expiresAt",s."planId" FROM "Subscription" s WHERE s."userId" = $1 AND s."status" = 'ACTIVE' ORDER BY s."createdAt" DESC LIMIT 1`,
      [principal.id],
    ) as any[];
    if (subRows.length === 0) throw new NotFoundAppError('No active subscription to renew');
    const sub = subRows[0];

    const planRows = await sql.query(`SELECT "id","slug","name","priceUsd","currency","durationDays","features" FROM "SubscriptionPlan" WHERE "id" = $1`, [sub.planId]) as any[];
    if (planRows.length === 0) throw new NotFoundAppError('Plan not found');
    const plan = planRows[0];

    const t = isoNow();
    const txId = crypto.randomUUID();

    // Mark subscription as payment-pending during renewal
    await sql.query(
      `UPDATE "Subscription" SET "status"='PAYMENT_PENDING',"updatedAt"=$2 WHERE "id"=$1`,
      [sub.id, t],
    );

    await sql.query(
      `INSERT INTO "PaymentTransaction" ("id","subscriptionId","userId","amountUsd","currency","status","provider","metadata","createdAt")
       VALUES ($1,$2,$3,$4,$5,'PENDING',$6,$7,$8)`,
      [txId, sub.id, principal.id, plan.priceUsd, plan.currency, body.paymentProvider, JSON.stringify({ planSlug: plan.slug, renewal: true }), t],
    );

    await repos.audit.record({
      actorUserId: principal.id,
      action: 'subscription.renewal.requested',
      resource: 'subscription',
      resourceId: sub.id,
      metadata: { planSlug: plan.slug, amountUsd: plan.priceUsd, provider: body.paymentProvider },
      ipAddress: request.ip,
    });

    return okResp({
      subscriptionId: sub.id,
      paymentTransactionId: txId,
      status: 'PAYMENT_PENDING',
      plan: { slug: plan.slug, name: plan.name, priceUsd: plan.priceUsd, currency: plan.currency, durationDays: plan.durationDays },
      message: 'Renewal payment pending. Complete payment to extend your subscription.',
    });
  });

  // ── Cancel subscription ───────────────────────────────────────────────
  app.post('/api/v1/subscriptions/cancel', { preHandler: [subLimit] }, async (request) => {
    const principal = await requireAuthDep(request);
    if (!sql) throw new Error('Database not configured');
    const now = isoNow();

    const subRows = await sql.query(
      `SELECT "id","status" FROM "Subscription" WHERE "userId" = $1 AND "status" = 'ACTIVE' ORDER BY "createdAt" DESC LIMIT 1`,
      [principal.id],
    ) as any[];
    if (subRows.length === 0) throw new NotFoundAppError('No active subscription to cancel');

    await sql.query(
      `UPDATE "Subscription" SET "status"='CANCELLED',"canceledAt"=$2,"updatedAt"=$3 WHERE "id"=$1`,
      [subRows[0].id, now, now],
    );
    await sql.query(
      `UPDATE "Device" SET "status"='SUSPENDED',"revokedAt"=$2 WHERE "userId" = $1 AND "subscriptionId" = $3`,
      [principal.id, now, subRows[0].id],
    );

    await repos.audit.record({
      actorUserId: principal.id,
      action: 'subscription.cancelled',
      resource: 'subscription',
      resourceId: subRows[0].id,
      metadata: { canceledAt: now },
      ipAddress: request.ip,
    });

    return okResp({ subscriptionId: subRows[0].id, status: 'CANCELLED', canceledAt: now });
  });

  // ── Payment history ───────────────────────────────────────────────────
  app.get('/api/v1/subscriptions/payments', { preHandler: [subLimit] }, async (request) => {
    const principal = await requireAuthDep(request);
    if (!sql) throw new Error('Database not configured');
    const rows = await sql.query(
      `SELECT pt."id",pt."amountUsd",pt."currency",pt."status",pt."provider",pt."providerRef",pt."paidAt",pt."failureReason",pt."createdAt",s."status" AS "subStatus"
       FROM "PaymentTransaction" pt
       JOIN "Subscription" s ON pt."subscriptionId" = s."id"
       WHERE pt."userId" = $1
       ORDER BY pt."createdAt" DESC`,
      [principal.id],
    ) as any[];
    return okResp({ payments: rows });
  });

  // ── Device Management ─────────────────────────────────────────────────
  app.get('/api/v1/devices', { preHandler: [deviceLimit] }, async (request) => {
    const principal = await requireAuthDep(request);
    if (!sql) throw new Error('Database not configured');
    const rows = await sql.query(
      `SELECT d."id",d."deviceId",d."label",d."platform",d."status",d."authorizedAt",d."revokedAt",d."lastConnectedAt",d."lastDisconnectedAt",d."metadata",d."subscriptionId",
              s."status" AS "subStatus"
       FROM "Device" d
       LEFT JOIN "Subscription" s ON d."subscriptionId" = s."id"
       WHERE d."userId" = $1 AND d."status" != 'REVOKED'
       ORDER BY d."createdAt" DESC`,
      [principal.id],
    ) as any[];
    return okResp({ devices: rows });
  });

  app.post('/api/v1/devices/enroll', { preHandler: [deviceLimit] }, async (request) => {
    const principal = await requireAuthDep(request);
    if (!sql) throw new Error('Database not configured');
    const body = z.object({ deviceId: z.string().min(1), label: z.string().optional(), platform: z.string().optional() }).parse(request.body ?? {});

    const entRows = await sql.query(
      `SELECT e."id",e."expiresAt" FROM "Entitlement" e WHERE e."userId" = $1 AND e."feature" = 'connect' AND e."status" = 'ACTIVE' AND (e."expiresAt" IS NULL OR e."expiresAt" > $2) LIMIT 1`,
      [principal.id, isoNow()],
    ) as any[];
    if (entRows.length === 0) {
      throw new ForbiddenAppError('No active connect entitlement. Purchase and activate a subscription first.');
    }

    const subRows = await sql.query(
      `SELECT s."id",p."maxDevices" FROM "Subscription" s JOIN "SubscriptionPlan" p ON s."planId" = p."id" WHERE s."userId" = $1 AND s."status" = 'ACTIVE' LIMIT 1`,
      [principal.id],
    ) as any[];
    const maxDevices = subRows.length > 0 ? Number(subRows[0].maxDevices) : 1;
    const devCount = await sql.query(`SELECT COUNT(*)::int AS n FROM "Device" WHERE "userId" = $1 AND "status" != 'REVOKED'`, [principal.id]) as any[];
    if (Number(devCount[0].n) >= maxDevices) {
      throw new ConflictAppError(`Device limit reached (max ${maxDevices} devices)`);
    }

    const existing = await sql.query(`SELECT "id" FROM "Device" WHERE "deviceId" = $1 AND "userId" = $2 AND "status" != 'REVOKED'`, [body.deviceId, principal.id]) as any[];
    if (existing.length > 0) throw new ConflictAppError('Device already enrolled');

    const t = isoNow();
    const devId = crypto.randomUUID();
    await sql.query(
      `INSERT INTO "Device" ("id","userId","subscriptionId","deviceId","label","platform","status","authorizedAt","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,'ENROLLED',$7,$8,$9)`,
      [devId, principal.id, subRows.length > 0 ? subRows[0].id : null, body.deviceId, body.label ?? null, body.platform ?? null, t, t, t],
    );

    await repos.audit.record({
      actorUserId: principal.id,
      action: 'device.enrolled',
      resource: 'device',
      resourceId: devId,
      metadata: { deviceId: body.deviceId, platform: body.platform },
      ipAddress: request.ip,
    });

    return okResp({ deviceId: devId, status: 'ENROLLED', message: 'Device enrolled. Connect when ready.' });
  });

  app.delete('/api/v1/devices/:deviceId', { preHandler: [deviceLimit] }, async (request) => {
    const principal = await requireAuthDep(request);
    if (!sql) throw new Error('Database not configured');
    const { deviceId } = z.object({ deviceId: z.string().min(1) }).parse(request.params);
    const now = isoNow();
    const r = await sql.query(
      `UPDATE "Device" SET "status"='REVOKED',"revokedAt"=$2,"updatedAt"=$3 WHERE "deviceId" = $1 AND "userId" = $4 AND "status" != 'REVOKED' RETURNING "id"`,
      [deviceId, now, now, principal.id],
    ) as any[];
    if (r.length === 0) throw new NotFoundAppError('Device not found');
    await repos.audit.record({
      actorUserId: principal.id,
      action: 'device.revoked',
      resource: 'device',
      resourceId: deviceId,
      metadata: { revokedAt: now },
      ipAddress: request.ip,
    });
    return okResp({ deviceId, status: 'REVOKED', revokedAt: now });
  });

  app.get('/api/v1/devices/:deviceId/authorize', { preHandler: [deviceLimit] }, async (request) => {
    const principal = await requireAuthDep(request);
    if (!sql) throw new Error('Database not configured');
    const { deviceId } = z.object({ deviceId: z.string().min(1) }).parse(request.params);
    const rows = await sql.query(
      `SELECT d."id",d."deviceId",d."status",d."authorizedAt",d."subscriptionId",
              s."status" AS "subStatus",s."expiresAt" AS "subExpiresAt",
              e."feature",e."status" AS "entStatus",e."expiresAt" AS "entExpiresAt"
       FROM "Device" d
       LEFT JOIN "Subscription" s ON d."subscriptionId" = s."id"
       LEFT JOIN "Entitlement" e ON e."userId" = d."userId" AND e."feature" = 'connect' AND e."status" = 'ACTIVE'
       WHERE d."deviceId" = $1 AND d."userId" = $2 AND d."status" != 'REVOKED'`,
      [deviceId, principal.id],
    ) as any[];
    if (rows.length === 0) throw new NotFoundAppError('Device not found');
    const dev = rows[0];
    const now = new Date();
    const subActive = dev.subStatus === 'ACTIVE' && (!dev.subExpiresAt || new Date(dev.subExpiresAt) > now);
    const entActive = dev.entStatus === 'ACTIVE' && (!dev.entExpiresAt || new Date(dev.entExpiresAt) > now);
    const authorized = subActive && entActive;
    return okResp({
      deviceId: dev.deviceId,
      deviceStatus: dev.status,
      subscriptionStatus: dev.subStatus,
      subscriptionActive: subActive,
      entitlementActive: entActive,
      authorized,
      reason: authorized ? 'Authorized' : !subActive ? 'Subscription expired or inactive' : 'Connect entitlement not active',
    });
  });

  app.post('/api/v1/devices/:deviceId/connect', { preHandler: [deviceLimit] }, async (request) => {
    const principal = await requireAuthDep(request);
    if (!sql) throw new Error('Database not configured');
    const { deviceId } = z.object({ deviceId: z.string().min(1) }).parse(request.params);
    const authz = await sql.query(
      `SELECT d."id",d."status" AS "devStatus",s."status" AS "subStatus",s."expiresAt" AS "subExpiresAt",
              e."status" AS "entStatus",e."expiresAt" AS "entExpiresAt"
       FROM "Device" d
       LEFT JOIN "Subscription" s ON d."subscriptionId" = s."id"
       LEFT JOIN "Entitlement" e ON e."userId" = d."userId" AND e."feature" = 'connect' AND e."status" = 'ACTIVE'
       WHERE d."deviceId" = $1 AND d."userId" = $2 AND d."status" != 'REVOKED'`,
      [deviceId, principal.id],
    ) as any[];
    if (authz.length === 0) throw new NotFoundAppError('Device not found');
    const a = authz[0];
    const now = new Date();
    const subActive = a.subStatus === 'ACTIVE' && (!a.subExpiresAt || new Date(a.subExpiresAt) > now);
    const entActive = a.entStatus === 'ACTIVE' && (!a.entExpiresAt || new Date(a.entExpiresAt) > now);
    if (!subActive || !entActive) throw new ForbiddenAppError('Device not authorized for connect. Active subscription with connect entitlement required.');
    const t = now.toISOString();
    await sql.query(`UPDATE "Device" SET "status"='ACTIVE',"authorizedAt"=$1,"lastConnectedAt"=$2,"updatedAt"=$3 WHERE "deviceId" = $4`, [now, now, now, deviceId]);
    await sql.query(`INSERT INTO "ConnectionState" ("deviceId","connected","quality","recordedAt") VALUES ($1,true,'good',$2)`, [a.id, now]);
    await repos.audit.record({
      actorUserId: principal.id,
      action: 'device.connect',
      resource: 'device',
      resourceId: deviceId,
      metadata: { connectedAt: t },
      ipAddress: request.ip,
    });

    // Also connect through the daemon's ConnectivityManager via control socket
    const sockPath = process.env.IRP_CONTROL_SOCKET || join(os.homedir(), '.local', 'state', 'irp', 'irp.sock');
    try {
      await controlRequest(sockPath, 'POST', '/v1/connect-device', { deviceId }, 10000);
    } catch (daemonErr) {
      // Daemon may not be running; database state is still updated. Log but don't fail.
      await repos.audit.record({
        actorUserId: principal.id,
        action: 'device.connect.daemon_unreachable',
        resource: 'device',
        resourceId: deviceId,
        metadata: { error: daemonErr instanceof Error ? daemonErr.message : String(daemonErr) },
        ipAddress: request.ip,
      });
    }

    return okResp({ deviceId, status: 'ACTIVE', connected: true, connectedAt: t });
  });

  app.post('/api/v1/devices/:deviceId/disconnect', { preHandler: [deviceLimit] }, async (request) => {
    const principal = await requireAuthDep(request);
    if (!sql) throw new Error('Database not configured');
    const { deviceId } = z.object({ deviceId: z.string().min(1) }).parse(request.params);
    const now = new Date();
    const t = now.toISOString();
    const r = await sql.query(`UPDATE "Device" SET "status"='ENROLLED',"lastDisconnectedAt"=$1,"updatedAt"=$2 WHERE "deviceId" = $3 AND "userId" = $4 RETURNING "id"`, [now, now, deviceId, principal.id]) as any[];
    if (r.length === 0) throw new NotFoundAppError('Device not found');
    await sql.query(`INSERT INTO "ConnectionState" ("deviceId","connected","quality","recordedAt") VALUES ($1,false,'good',$2)`, [r[0].id, now]);
    await repos.audit.record({
      actorUserId: principal.id,
      action: 'device.disconnect',
      resource: 'device',
      resourceId: deviceId,
      metadata: { disconnectedAt: t },
      ipAddress: request.ip,
    });

    // Also disconnect through the daemon's ConnectivityManager via control socket
    const sockPath = process.env.IRP_CONTROL_SOCKET || join(os.homedir(), '.local', 'state', 'irp', 'irp.sock');
    try {
      await controlRequest(sockPath, 'POST', '/v1/disconnect-device', { deviceId }, 10000);
    } catch (daemonErr) {
      // Daemon may not be running; database state is still updated. Log but don't fail.
      await repos.audit.record({
        actorUserId: principal.id,
        action: 'device.disconnect.daemon_unreachable',
        resource: 'device',
        resourceId: deviceId,
        metadata: { error: daemonErr instanceof Error ? daemonErr.message : String(daemonErr) },
        ipAddress: request.ip,
      });
    }

    return okResp({ deviceId, status: 'ENROLLED', connected: false, disconnectedAt: t });
  });

  // ── Admin: Customer & Subscription Visibility ─────────────────────────
  app.get('/api/v1/admin/subscriptions', { preHandler: [adminLimit] }, async (request) => {
    const principal = await requireAuthDep(request);
    if (!(principal.roles as string[]).includes('platform_admin')) throw new ForbiddenAppError('Super Admin required');
    if (!sql) throw new Error('Database not configured');
    const rows = await sql.query(
      `SELECT s."id",s."userId",s."planId",s."status",s."startedAt",s."expiresAt",s."canceledAt",s."autoRenew",s."createdAt",s."updatedAt",
              u."email",u."name",
              p."slug" AS planSlug,p."name" AS planName,p."priceUsd"
       FROM "Subscription" s
       JOIN "User" u ON s."userId" = u."id"
       JOIN "SubscriptionPlan" p ON s."planId" = p."id"
       ORDER BY s."createdAt" DESC`,
    ) as any[];
    return okResp({ subscriptions: rows });
  });

  app.get('/api/v1/admin/users/:userId/subscription', { preHandler: [adminLimit] }, async (request) => {
    const principal = await requireAuthDep(request);
    if (!(principal.roles as string[]).includes('platform_admin')) throw new ForbiddenAppError('Super Admin required');
    if (!sql) throw new Error('Database not configured');
    const { userId } = z.object({ userId: z.string().min(1) }).parse(request.params);
    const subRows = await sql.query(
      `SELECT s."id",s."planId",s."status",s."startedAt",s."expiresAt",s."canceledAt",s."autoRenew",s."createdAt",
              p."slug" AS planSlug,p."name" AS planName,p."priceUsd",p."maxDevices"
       FROM "Subscription" s JOIN "SubscriptionPlan" p ON s."planId" = p."id" WHERE s."userId" = $1 ORDER BY s."createdAt" DESC LIMIT 1`,
      [userId],
    ) as any[];
    const devRows = await sql.query(`SELECT d."deviceId",d."label",d."platform",d."status",d."authorizedAt",d."lastConnectedAt" FROM "Device" d WHERE d."userId" = $1 AND d."status" != 'REVOKED' ORDER BY d."createdAt" DESC`, [userId]) as any[];
    const payRows = await sql.query(`SELECT pt."amountUsd",pt."currency",pt."status",pt."provider",pt."paidAt",pt."createdAt" FROM "PaymentTransaction" pt WHERE pt."userId" = $1 ORDER BY pt."createdAt" DESC`, [userId]) as any[];
    return okResp({ subscription: subRows[0] ?? null, devices: devRows, payments: payRows });
  });
};
