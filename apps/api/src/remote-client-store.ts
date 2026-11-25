import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { SqlClient, SqlExecutor } from '@irp/database';
import {
  DeviceCredentialService,
  RotatingRefreshTokenStore,
  SecurityAuditLog,
  sanitizeSecurityMetadata,
  type AuthenticatedDevice,
  type IssuedDeviceCredential,
  type RemoteClientPlatform,
  type RemoteClientScope,
  type RotatedRefreshToken,
  type SecurityAuditAction,
  type SecurityAuditEvent,
} from '@irp/auth';

/**
 * Persistence boundary for remote-client (device) credentials, rotating refresh tokens, enrollment requests
 * and the client security audit trail (issue #410). Only HMAC digests of secrets are stored. The PostgreSQL
 * implementation is the production path; the in-memory one wraps the original @irp/auth classes and exists
 * for tests/development only (production and staging refuse it, see durability.ts).
 */

export interface RemoteClientKeys {
  readonly credentialKey: string;
  readonly refreshKey: string;
}

export interface RemoteClientDevice {
  credentialId: string;
  deviceId: string;
  platform: RemoteClientPlatform;
  label?: string;
  scopes: readonly RemoteClientScope[];
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface EnrollmentRequestRecord {
  id: string;
  userId: string;
  platform: RemoteClientPlatform;
  label?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  credentialId?: string;
  deviceId?: string;
}

export interface AuditInput {
  action: SecurityAuditAction;
  success: boolean;
  subjectId?: string;
  deviceId?: string;
  credentialId?: string;
  metadata?: Record<string, unknown>;
}

export interface RemoteClientStore {
  readonly kind: 'postgres' | 'development-memory';
  issueCredential(input: {
    platform: RemoteClientPlatform;
    deviceId?: string;
    label?: string;
    ttlSeconds?: number;
    scopes: readonly RemoteClientScope[];
  }): Promise<{ issued: IssuedDeviceCredential; device: RemoteClientDevice }>;
  /** Returns null for unknown, revoked, expired or wrong-secret credentials (indistinguishable to callers). */
  authenticateCredential(
    credentialId: string,
    secret: string,
  ): Promise<{ auth: AuthenticatedDevice; device: RemoteClientDevice } | null>;
  getDevice(credentialId: string): Promise<RemoteClientDevice | null>;
  listDevices(): Promise<RemoteClientDevice[]>;
  /** Revokes the credential and every refresh token issued for it. `revoked` is also true if already revoked. */
  revokeCredential(
    credentialId: string,
  ): Promise<{ revoked: boolean; device: RemoteClientDevice | null }>;
  issueRefreshToken(credentialId: string, scopes: readonly string[]): Promise<RotatedRefreshToken>;
  /** Single-use: exactly one concurrent caller (across instances) can rotate a given token. */
  rotateRefreshToken(token: string): Promise<RotatedRefreshToken | null>;
  revokeRefreshToken(tokenId: string): Promise<boolean>;
  createEnrollmentRequest(input: {
    userId: string;
    platform: RemoteClientPlatform;
    label?: string;
  }): Promise<EnrollmentRequestRecord>;
  listPendingEnrollmentRequests(): Promise<EnrollmentRequestRecord[]>;
  /** Atomically claims a pending request and issues its credential. Null if missing or already decided. */
  approveEnrollmentRequest(
    requestId: string,
    decidedBy: string,
    scopes: readonly RemoteClientScope[],
  ): Promise<{
    request: EnrollmentRequestRecord;
    issued: IssuedDeviceCredential;
    device: RemoteClientDevice;
  } | null>;
  rejectEnrollmentRequest(requestId: string, decidedBy: string): Promise<EnrollmentRequestRecord | null>;
  recordAudit(input: AuditInput): Promise<void>;
  listAudit(limit?: number): Promise<readonly SecurityAuditEvent[]>;
  ping(): Promise<void>;
}

const MAX_STRING_LENGTH = 256;
const MAX_AUDIT_LIST = 1_000;
const DEFAULT_CREDENTIAL_TTL_SECONDS = 90 * 24 * 60 * 60;
const DEFAULT_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bounded = (value: string): string =>
  value.length <= MAX_STRING_LENGTH ? value : `${value.slice(0, MAX_STRING_LENGTH - 1)}…`;
const digestHex = (secret: string, key: string): string =>
  createHmac('sha256', key).update(secret.trim(), 'utf8').digest('hex');
const sameDigest = (a: string, b: string): boolean => {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
};
const assertKey = (name: string, value: string) => {
  if (value.length < 32) throw new Error(`${name} must be at least 32 characters.`);
};

// ---------------------------------------------------------------------------------------------
// Development/test implementation: the original in-memory @irp/auth services, unchanged behaviour.
// ---------------------------------------------------------------------------------------------
export const createMemoryRemoteClientStore = (keys: RemoteClientKeys): RemoteClientStore => {
  const credentials = new DeviceCredentialService(keys.credentialKey);
  const refreshTokens = new RotatingRefreshTokenStore(keys.refreshKey);
  const audit = new SecurityAuditLog();
  const devices = new Map<string, RemoteClientDevice>();
  const requests = new Map<string, EnrollmentRequestRecord>();
  const copy = (d: RemoteClientDevice): RemoteClientDevice => ({ ...d });
  const issue = (
    input: { platform: RemoteClientPlatform; deviceId?: string; label?: string; ttlSeconds?: number },
    scopes: readonly RemoteClientScope[],
  ) => {
    const issued = credentials.issue({
      platform: input.platform,
      ...(input.deviceId !== undefined ? { deviceId: input.deviceId } : {}),
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.ttlSeconds !== undefined ? { ttlSeconds: input.ttlSeconds } : {}),
    });
    const device: RemoteClientDevice = {
      credentialId: issued.credentialId,
      deviceId: issued.deviceId,
      platform: input.platform,
      ...(input.label ? { label: input.label } : {}),
      scopes,
      createdAt: new Date().toISOString(),
      expiresAt: issued.expiresAt,
    };
    devices.set(issued.credentialId, device);
    return { issued, device: copy(device) };
  };
  return {
    kind: 'development-memory',
    async issueCredential(input) {
      return issue(input, input.scopes);
    },
    async authenticateCredential(credentialId, secret) {
      const auth = credentials.authenticate(credentialId, secret);
      const device = devices.get(credentialId);
      if (!auth || !device || device.revokedAt) return null;
      return { auth, device: copy(device) };
    },
    async getDevice(credentialId) {
      const d = devices.get(credentialId);
      return d ? copy(d) : null;
    },
    async listDevices() {
      return [...devices.values()].map(copy);
    },
    async revokeCredential(credentialId) {
      const device = devices.get(credentialId);
      const revokedNow = credentials.revoke(credentialId);
      refreshTokens.revokeSubject(credentialId);
      if (device && !device.revokedAt) device.revokedAt = new Date().toISOString();
      return { revoked: revokedNow || Boolean(device?.revokedAt), device: device ? copy(device) : null };
    },
    async issueRefreshToken(credentialId, scopes) {
      return refreshTokens.issue(credentialId, scopes);
    },
    async rotateRefreshToken(token) {
      return refreshTokens.rotate(token);
    },
    async revokeRefreshToken(tokenId) {
      return refreshTokens.revoke(tokenId);
    },
    async createEnrollmentRequest(input) {
      const record: EnrollmentRequestRecord = {
        id: randomUUID(),
        userId: input.userId,
        platform: input.platform,
        ...(input.label ? { label: input.label } : {}),
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      requests.set(record.id, record);
      return { ...record };
    },
    async listPendingEnrollmentRequests() {
      return [...requests.values()].filter((r) => r.status === 'pending').map((r) => ({ ...r }));
    },
    async approveEnrollmentRequest(requestId, decidedBy, scopes) {
      const record = requests.get(requestId);
      if (!record || record.status !== 'pending') return null;
      const { issued, device } = issue(
        { platform: record.platform, ...(record.label ? { label: record.label } : {}) },
        scopes,
      );
      record.status = 'approved';
      record.decidedAt = new Date().toISOString();
      record.decidedBy = decidedBy;
      record.credentialId = issued.credentialId;
      record.deviceId = issued.deviceId;
      return { request: { ...record }, issued, device };
    },
    async rejectEnrollmentRequest(requestId, decidedBy) {
      const record = requests.get(requestId);
      if (!record || record.status !== 'pending') return null;
      record.status = 'rejected';
      record.decidedAt = new Date().toISOString();
      record.decidedBy = decidedBy;
      return { ...record };
    },
    async recordAudit(input) {
      audit.record({
        action: input.action,
        success: input.success,
        ...(input.subjectId ? { subjectId: input.subjectId } : {}),
        ...(input.deviceId ? { deviceId: input.deviceId } : {}),
        ...(input.credentialId ? { credentialId: input.credentialId } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      });
    },
    async listAudit(limit = MAX_AUDIT_LIST) {
      return audit.list(limit);
    },
    async ping() {
      return undefined;
    },
  };
};

// ---------------------------------------------------------------------------------------------
// PostgreSQL implementation (production path).
// ---------------------------------------------------------------------------------------------
type Row = Record<string, unknown>;
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOrUndef = (v: unknown): string | undefined => (v == null ? undefined : iso(v));
// Timestamps are `timestamp(3)` holding UTC wall-clock values; AT TIME ZONE 'UTC' makes reads unambiguous.
const ts = (col: string) => `"${col}" AT TIME ZONE 'UTC' AS "${col}"`;
const CREDENTIAL_COLS = `"id","deviceId","platform","label","scopes","secretDigest",${ts('expiresAt')},${ts('revokedAt')},${ts('lastUsedAt')},${ts('createdAt')}`;
const REQUEST_COLS = `"id","userId","platform","label","status",${ts('createdAt')},${ts('decidedAt')},"decidedBy","credentialId"::text AS "credentialId","deviceId"`;

const toDevice = (r: Row): RemoteClientDevice => ({
  credentialId: String(r.id),
  deviceId: String(r.deviceId),
  platform: r.platform as RemoteClientPlatform,
  ...(r.label ? { label: String(r.label) } : {}),
  scopes: (r.scopes as RemoteClientScope[]) ?? [],
  createdAt: iso(r.createdAt),
  expiresAt: iso(r.expiresAt),
  ...(r.revokedAt ? { revokedAt: iso(r.revokedAt) } : {}),
});
const toRequest = (r: Row): EnrollmentRequestRecord => ({
  id: String(r.id),
  userId: String(r.userId),
  platform: r.platform as RemoteClientPlatform,
  ...(r.label ? { label: String(r.label) } : {}),
  status: r.status as EnrollmentRequestRecord['status'],
  createdAt: iso(r.createdAt),
  ...(isoOrUndef(r.decidedAt) ? { decidedAt: isoOrUndef(r.decidedAt)! } : {}),
  ...(r.decidedBy ? { decidedBy: String(r.decidedBy) } : {}),
  ...(r.credentialId ? { credentialId: String(r.credentialId) } : {}),
  ...(r.deviceId ? { deviceId: String(r.deviceId) } : {}),
});

export const createPostgresRemoteClientStore = (
  sql: SqlClient | SqlExecutor,
  keys: RemoteClientKeys,
): RemoteClientStore => {
  assertKey('Device credential key', keys.credentialKey);
  assertKey('Refresh token key', keys.refreshKey);
  const runner = sql as SqlClient;
  const transact = <T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> =>
    typeof runner.transaction === 'function' ? runner.transaction(fn) : fn(sql);

  const insertCredential = async (
    tx: SqlExecutor,
    input: {
      platform: RemoteClientPlatform;
      deviceId?: string;
      label?: string;
      ttlSeconds?: number;
      scopes: readonly RemoteClientScope[];
    },
  ) => {
    const now = new Date();
    const ttl = input.ttlSeconds ?? DEFAULT_CREDENTIAL_TTL_SECONDS;
    if (!Number.isInteger(ttl) || ttl < 60 || ttl > 365 * 24 * 60 * 60)
      throw new Error('Invalid device credential TTL.');
    const deviceId = input.deviceId?.trim() || randomUUID();
    const credentialId = randomUUID();
    const secret = `irp_dc_${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();
    const label = input.label ? bounded(input.label) : null;
    await tx.query(
      `INSERT INTO "RemoteClientCredential"
         ("id","deviceId","platform","label","scopes","secretDigest","expiresAt","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
      [
        credentialId,
        deviceId,
        input.platform,
        label,
        [...input.scopes],
        digestHex(secret, keys.credentialKey),
        expiresAt,
        now.toISOString(),
      ],
    );
    const device: RemoteClientDevice = {
      credentialId,
      deviceId,
      platform: input.platform,
      ...(label ? { label } : {}),
      scopes: [...input.scopes],
      createdAt: now.toISOString(),
      expiresAt,
    };
    return { issued: { credentialId, deviceId, secret, expiresAt }, device };
  };

  const selectDevice = async (tx: SqlExecutor, credentialId: string) => {
    if (!UUID.test(credentialId)) return null;
    const rows = await tx.query(`SELECT ${CREDENTIAL_COLS} FROM "RemoteClientCredential" WHERE "id"=$1`, [
      credentialId,
    ]);
    return rows[0] ?? null;
  };

  return {
    kind: 'postgres',
    async issueCredential(input) {
      return transact((tx) => insertCredential(tx, input));
    },
    async authenticateCredential(credentialId, secret) {
      const row = await selectDevice(sql, credentialId);
      if (!row) return null;
      const now = new Date();
      if (row.revokedAt || Date.parse(iso(row.expiresAt)) <= now.getTime()) return null;
      if (!sameDigest(digestHex(secret, keys.credentialKey), String(row.secretDigest))) return null;
      await sql.query(`UPDATE "RemoteClientCredential" SET "lastUsedAt"=$2,"updatedAt"=$2 WHERE "id"=$1`, [
        credentialId,
        now.toISOString(),
      ]);
      const device = toDevice(row);
      return {
        auth: {
          credentialId: device.credentialId,
          deviceId: device.deviceId,
          platform: device.platform,
          ...(device.label ? { label: device.label } : {}),
          expiresAt: device.expiresAt,
          lastUsedAt: now.toISOString(),
        },
        device,
      };
    },
    async getDevice(credentialId) {
      const row = await selectDevice(sql, credentialId);
      return row ? toDevice(row) : null;
    },
    async listDevices() {
      const rows = await sql.query(
        `SELECT ${CREDENTIAL_COLS} FROM "RemoteClientCredential" ORDER BY "createdAt" ASC, "id" ASC`,
      );
      return rows.map(toDevice);
    },
    async revokeCredential(credentialId) {
      if (!UUID.test(credentialId)) return { revoked: false, device: null };
      return transact(async (tx) => {
        const nowIso = new Date().toISOString();
        const changed = await tx.query(
          `UPDATE "RemoteClientCredential" SET "revokedAt"=$2,"updatedAt"=$2
           WHERE "id"=$1 AND "revokedAt" IS NULL RETURNING "id"`,
          [credentialId, nowIso],
        );
        await tx.query(
          `UPDATE "RemoteClientRefreshToken" SET "revokedAt"=$2 WHERE "credentialId"=$1 AND "revokedAt" IS NULL`,
          [credentialId, nowIso],
        );
        const row = await selectDevice(tx, credentialId);
        const device = row ? toDevice(row) : null;
        return { revoked: changed.length > 0 || Boolean(device?.revokedAt), device };
      });
    },
    async issueRefreshToken(credentialId, scopes) {
      if (!credentialId.trim()) throw new Error('Refresh token subject is required.');
      const now = new Date();
      const tokenId = randomUUID();
      const token = `irp_rt_${randomBytes(48).toString('base64url')}`;
      const expiresAt = new Date(now.getTime() + DEFAULT_REFRESH_TTL_SECONDS * 1000).toISOString();
      const unique = [...new Set(scopes)].map(bounded);
      await sql.query(
        `INSERT INTO "RemoteClientRefreshToken" ("id","credentialId","tokenDigest","scopes","issuedAt","expiresAt")
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [tokenId, credentialId, digestHex(token, keys.refreshKey), unique, now.toISOString(), expiresAt],
      );
      return { tokenId, token, subject: credentialId, scopes: unique, expiresAt };
    },
    async rotateRefreshToken(token) {
      const digest = digestHex(token, keys.refreshKey);
      return transact(async (tx) => {
        const now = new Date().toISOString();
        // The conditional UPDATE is the single-use guard: under concurrent rotation the losers re-evaluate
        // the WHERE clause after the winner commits, see usedAt set, and match no row.
        const claimed = await tx.query<Row>(
          `UPDATE "RemoteClientRefreshToken" SET "usedAt"=$2
           WHERE "tokenDigest"=$1 AND "usedAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt" > $2
           RETURNING "credentialId"::text AS "credentialId","scopes","expiresAt" AT TIME ZONE 'UTC' AS "expiresAt"`,
          [digest, now],
        );
        const old = claimed[0];
        if (!old) return null;
        const tokenId = randomUUID();
        const replacement = `irp_rt_${randomBytes(48).toString('base64url')}`;
        const expiresAt = iso(old.expiresAt);
        const scopes = (old.scopes as string[]) ?? [];
        await tx.query(
          `INSERT INTO "RemoteClientRefreshToken" ("id","credentialId","tokenDigest","scopes","issuedAt","expiresAt")
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [tokenId, old.credentialId, digestHex(replacement, keys.refreshKey), scopes, now, expiresAt],
        );
        return {
          tokenId,
          token: replacement,
          subject: String(old.credentialId),
          scopes,
          expiresAt,
        };
      });
    },
    async revokeRefreshToken(tokenId) {
      if (!UUID.test(tokenId)) return false;
      const rows = await sql.query(
        `UPDATE "RemoteClientRefreshToken" SET "revokedAt"=$2 WHERE "id"=$1 AND "revokedAt" IS NULL RETURNING "id"`,
        [tokenId, new Date().toISOString()],
      );
      return rows.length > 0;
    },
    async createEnrollmentRequest(input) {
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      const label = input.label ? bounded(input.label) : null;
      await sql.query(
        `INSERT INTO "RemoteClientEnrollmentRequest" ("id","userId","platform","label","status","createdAt")
         VALUES ($1,$2,$3,$4,'pending',$5)`,
        [id, input.userId, input.platform, label, createdAt],
      );
      return {
        id,
        userId: input.userId,
        platform: input.platform,
        ...(label ? { label } : {}),
        status: 'pending',
        createdAt,
      };
    },
    async listPendingEnrollmentRequests() {
      const rows = await sql.query(
        `SELECT ${REQUEST_COLS} FROM "RemoteClientEnrollmentRequest" WHERE "status"='pending' ORDER BY "createdAt" ASC, "id" ASC`,
      );
      return rows.map(toRequest);
    },
    async approveEnrollmentRequest(requestId, decidedBy, scopes) {
      if (!UUID.test(requestId)) return null;
      return transact(async (tx) => {
        const decidedAt = new Date().toISOString();
        const claimed = await tx.query<Row>(
          `UPDATE "RemoteClientEnrollmentRequest" SET "status"='approved',"decidedAt"=$2,"decidedBy"=$3
           WHERE "id"=$1 AND "status"='pending'
           RETURNING ${REQUEST_COLS}`,
          [requestId, decidedAt, decidedBy],
        );
        const request = claimed[0];
        if (!request) return null;
        const { issued, device } = await insertCredential(tx, {
          platform: request.platform as RemoteClientPlatform,
          ...(request.label ? { label: String(request.label) } : {}),
          scopes,
        });
        await tx.query(
          `UPDATE "RemoteClientEnrollmentRequest" SET "credentialId"=$2,"deviceId"=$3 WHERE "id"=$1`,
          [requestId, issued.credentialId, issued.deviceId],
        );
        return {
          request: {
            ...toRequest(request),
            credentialId: issued.credentialId,
            deviceId: issued.deviceId,
          },
          issued,
          device,
        };
      });
    },
    async rejectEnrollmentRequest(requestId, decidedBy) {
      if (!UUID.test(requestId)) return null;
      const rows = await sql.query<Row>(
        `UPDATE "RemoteClientEnrollmentRequest" SET "status"='rejected',"decidedAt"=$2,"decidedBy"=$3
         WHERE "id"=$1 AND "status"='pending' RETURNING ${REQUEST_COLS}`,
        [requestId, new Date().toISOString(), decidedBy],
      );
      return rows[0] ? toRequest(rows[0]) : null;
    },
    async recordAudit(input) {
      await sql.query(
        `INSERT INTO "RemoteClientAuditEvent" ("id","at","action","subjectId","deviceId","credentialId","success","metadata")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
        [
          randomUUID(),
          new Date().toISOString(),
          input.action,
          input.subjectId ? bounded(input.subjectId) : null,
          input.deviceId ? bounded(input.deviceId) : null,
          input.credentialId ? bounded(input.credentialId) : null,
          input.success,
          JSON.stringify(sanitizeSecurityMetadata(input.metadata)),
        ],
      );
    },
    async listAudit(limit = MAX_AUDIT_LIST) {
      const rows = await sql.query<Row>(
        `SELECT "id","at" AT TIME ZONE 'UTC' AS "at","action","subjectId","deviceId","credentialId","success","metadata"
         FROM "RemoteClientAuditEvent" ORDER BY "at" DESC, "id" DESC LIMIT $1`,
        [Math.max(1, Math.min(limit, MAX_AUDIT_LIST))],
      );
      return rows.reverse().map((r) => ({
        id: String(r.id),
        at: iso(r.at),
        action: r.action as SecurityAuditAction,
        ...(r.subjectId ? { subjectId: String(r.subjectId) } : {}),
        ...(r.deviceId ? { deviceId: String(r.deviceId) } : {}),
        ...(r.credentialId ? { credentialId: String(r.credentialId) } : {}),
        success: Boolean(r.success),
        metadata: (r.metadata as Record<string, unknown>) ?? {},
      }));
    },
    async ping() {
      await sql.query('SELECT 1');
    },
  };
};
