import { type SqlClient, type SqlExecutor } from '@irp/database';
import {
  AccessDeniedError,
  DuplicateError,
  MEMBER_ROLES,
  hasRole,
  MissingParentError,
  QuotaExceededError,
  StaleWriteError,
  tenantQuotasFromEnv,
  type TenantQuotas,
  type MemberRole,
  type MembershipRecord,
  type OrganizationRole,
  type ParentFilter,
  type UpdateOptions,
  type AuditEntry,
  type IdentityRepositories,
  type OneTimeTokenRecord,
  type OneTimeTokenType,
  type OrganizationRecord,
  type Page,
  type PageQuery,
  type ProjectRecord,
  type RateLimitDecision,
  type RetentionPolicy,
  type RetentionResult,
  type RotationResult,
  type SessionRecord,
  type TenantScope,
  type UserRecord,
  type WorkspaceRecord,
} from './types.js';

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));
// Timestamps are stored as UTC `timestamp(3)`; reading them via AT TIME ZONE 'UTC' yields an unambiguous instant.
const ts = (col: string, alias = col) => `"${col}" AT TIME ZONE 'UTC' AS "${alias}"`;
const isUnique = (e: unknown) =>
  typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';

const USER_COLS = `"id","email","name","passwordHash","status","roles","permissions",${ts('emailVerifiedAt')},${ts('lastLoginAt')},${ts('createdAt')},${ts('updatedAt')},${ts('deletedAt')}`;
const SESSION_COLS = `"id","userId","familyId","refreshTokenHash","userAgent","ipAddress",${ts('expiresAt')},${ts('revokedAt')},${ts('createdAt')}`;
const ORG_COLS = `"id","name","slug","ownerUserId",${ts('createdAt')},${ts('updatedAt')},${ts('deletedAt')}`;
const PROJECT_COLS = `"id","organizationId","name","slug","description",${ts('createdAt')},${ts('updatedAt')},${ts('deletedAt')}`;
const WORKSPACE_COLS = `"id","organizationId","projectId","name","slug","environment",${ts('createdAt')},${ts('updatedAt')},${ts('deletedAt')}`;

type Row = Record<string, unknown>;
const toUser = (r: Row): UserRecord => ({
  id: String(r.id),
  email: String(r.email),
  name: String(r.name ?? ''),
  passwordHash: String(r.passwordHash),
  status: r.status as UserRecord['status'],
  roles: (r.roles as string[]) ?? [],
  permissions: (r.permissions as string[]) ?? [],
  emailVerifiedAt: isoOrNull(r.emailVerifiedAt),
  lastLoginAt: isoOrNull(r.lastLoginAt),
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
  deletedAt: isoOrNull(r.deletedAt),
});
const toSession = (r: Row): SessionRecord => ({
  id: String(r.id),
  userId: String(r.userId),
  familyId: String(r.familyId),
  refreshTokenHash: String(r.refreshTokenHash),
  ...(r.userAgent ? { userAgent: String(r.userAgent) } : {}),
  ...(r.ipAddress ? { ipAddress: String(r.ipAddress) } : {}),
  expiresAt: iso(r.expiresAt),
  revokedAt: isoOrNull(r.revokedAt),
  createdAt: iso(r.createdAt),
});
const toOrg = (r: Row): OrganizationRecord => ({
  id: String(r.id),
  name: String(r.name),
  slug: String(r.slug),
  ownerUserId: r.ownerUserId ? String(r.ownerUserId) : null,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
  deletedAt: isoOrNull(r.deletedAt),
});
const toProject = (r: Row): ProjectRecord => ({
  id: String(r.id),
  organizationId: String(r.organizationId),
  name: String(r.name),
  slug: String(r.slug),
  ...(r.description ? { description: String(r.description) } : {}),
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
  deletedAt: isoOrNull(r.deletedAt),
});
const toWorkspace = (r: Row): WorkspaceRecord => ({
  id: String(r.id),
  organizationId: String(r.organizationId),
  ...(r.projectId ? { projectId: String(r.projectId) } : {}),
  name: String(r.name),
  slug: String(r.slug),
  environment: String(r.environment),
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
  deletedAt: isoOrNull(r.deletedAt),
});

// Whitelisted ORDER BY targets: identifiers can never be parameterised, so user input only selects a key.
const ORDER: Record<string, string> = {
  createdAt: '"createdAt"',
  updatedAt: '"updatedAt"',
  name: '"name"',
  slug: '"slug"',
  email: '"email"',
};
const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

interface ListSpec<T> {
  table: string;
  cols: string;
  map: (r: Row) => T;
  searchCols: string[];
  /** SQL predicate restricting to the caller's tenant; receives the next param index. */
  tenant?: (scope: TenantScope, nextIdx: number) => { sql: string; values: unknown[] };
}
const list = async <T>(
  db: SqlExecutor,
  spec: ListSpec<T>,
  q: PageQuery,
  scope?: TenantScope,
  parent?: ParentFilter,
): Promise<Page<T>> => {
  const where: string[] = ['"deletedAt" IS NULL'];
  const values: unknown[] = [];
  if (spec.tenant) {
    if (!scope) throw new Error(`A tenant scope is required to list ${spec.table}`);
    const t = spec.tenant(scope, values.length + 1);
    if (t.sql) where.push(t.sql);
    values.push(...t.values);
  }
  for (const [column, value] of parentWhere(parent)) {
    values.push(value);
    where.push(`"${column}" = $${values.length}`);
  }
  if (q.search) {
    values.push(like(q.search));
    where.push(
      `(${spec.searchCols.map((c) => `"${c}"::text ILIKE $${values.length}`).join(' OR ')})`,
    );
  }
  const w = where.join(' AND ');
  const order = ORDER[q.sort] ?? ORDER.createdAt;
  const total = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM "${spec.table}" WHERE ${w}`,
    values,
  );
  const rows = await db.query<Row>(
    `SELECT ${spec.cols} FROM "${spec.table}" WHERE ${w} ORDER BY ${order} ${q.order === 'asc' ? 'ASC' : 'DESC'}, "id" LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
    values,
  );
  return {
    items: rows.map(spec.map),
    total: Number(total[0]?.n ?? 0),
    page: q.page,
    pageSize: q.pageSize,
  };
};
const KNOWN_ROLES = MEMBER_ROLES.map((r) => `'${r}'`).join(',');
// `$n` is the caller's user id: organizations they own or actively belong to.
const accessibleOrgs = (idx: number) =>
  `SELECT o."id" FROM "Organization" o WHERE o."deletedAt" IS NULL AND (o."ownerUserId" = $${idx} OR EXISTS (
     SELECT 1 FROM "Membership" m JOIN "Role" r ON r."id" = m."roleId"
     WHERE m."organizationId" = o."id" AND m."userId" = $${idx} AND m."status" = 'active' AND r."slug" IN (${KNOWN_ROLES})))`;
const orgTenant = (scope: TenantScope, idx: number) =>
  scope.kind === 'all'
    ? { sql: '', values: [] }
    : { sql: `"id" IN (${accessibleOrgs(idx)})`, values: [scope.userId] };
// Children of an archived organization stay hidden from everyone, platform admins included.
const viaOrgTenant = (scope: TenantScope, idx: number) =>
  scope.kind === 'all'
    ? {
        sql: `"organizationId" IN (SELECT o."id" FROM "Organization" o WHERE o."deletedAt" IS NULL)`,
        values: [],
      }
    : { sql: `"organizationId" IN (${accessibleOrgs(idx)})`, values: [scope.userId] };
// A workspace is also hidden once its project is archived.
const workspaceTenant = (scope: TenantScope, idx: number) => {
  const org = viaOrgTenant(scope, idx);
  return {
    sql: `${org.sql} AND ("projectId" IS NULL OR EXISTS (SELECT 1 FROM "Project" p WHERE p."id" = "Workspace"."projectId" AND p."deletedAt" IS NULL))`,
    values: org.values,
  };
};

/** Applies a partial update; only the provided columns change, so unrelated concurrent edits survive. */
const patchRow = async <T>(
  db: SqlExecutor,
  table: 'Organization' | 'Project' | 'Workspace',
  cols: string,
  map: (r: Row) => T,
  id: string,
  patch: Record<string, unknown>,
  options: UpdateOptions,
): Promise<T | null> => {
  const values: unknown[] = [id, options.at];
  // Column names come from the typed patch objects, never from request input.
  const sets = Object.entries(patch)
    .filter(([, v]) => v !== undefined)
    .map(([column, v]) => {
      values.push(v);
      return `"${column}" = $${values.length}`;
    });
  // updatedAt always advances, so it can serve as the row version.
  sets.push(`"updatedAt" = GREATEST($2::timestamp(3), "updatedAt" + interval '1 millisecond')`);
  let guard = '';
  if (options.expectedUpdatedAt) {
    values.push(options.expectedUpdatedAt);
    guard = ` AND "updatedAt" = $${values.length}::timestamp(3)`;
  }
  try {
    const rows = await db.query<Row>(
      `UPDATE "${table}" SET ${sets.join(', ')} WHERE "id" = $1 AND "deletedAt" IS NULL${guard} RETURNING ${cols}`,
      values,
    );
    if (rows[0]) return map(rows[0]);
  } catch (e) {
    if (isUnique(e)) throw new DuplicateError('slug');
    throw e;
  }
  if (!options.expectedUpdatedAt) return null;
  const alive = await db.query(`SELECT 1 FROM "${table}" WHERE "id" = $1 AND "deletedAt" IS NULL`, [id]);
  if (alive.length) throw new StaleWriteError();
  return null;
};

const roleIn = async (
  db: SqlExecutor,
  organizationId: string,
  userId: string,
): Promise<OrganizationRole | null> => {
  const rows = await db.query<{ role: string | null }>(
    `SELECT CASE WHEN o."ownerUserId" = $2 THEN 'owner' ELSE (
       SELECT r."slug" FROM "Membership" m JOIN "Role" r ON r."id" = m."roleId"
       WHERE m."organizationId" = o."id" AND m."userId" = $2 AND m."status" = 'active' AND r."slug" IN (${KNOWN_ROLES})) END AS "role"
     FROM "Organization" o WHERE o."id" = $1 AND o."deletedAt" IS NULL`,
    [organizationId, userId],
  );
  return (rows[0]?.role as OrganizationRole | undefined) ?? null;
};
/** Call while holding the organization lock, so the answer holds until commit. */
const assertRole = async (
  tx: SqlExecutor,
  organizationId: string,
  actor: TenantScope,
  minimum: OrganizationRole,
): Promise<void> => {
  if (actor.kind === 'all') return;
  const role = await roleIn(tx, organizationId, actor.userId);
  if (!role) throw new AccessDeniedError(organizationId, 'not_a_member');
  if (!hasRole(role, minimum)) throw new AccessDeniedError(organizationId, 'insufficient_role');
};
/**
 * Locks the organization of a live project or workspace and rechecks the actor. False when the record or
 * its organization is gone. `organizationId` never changes, so reading it before the lock is safe.
 */
const lockOwnerOf = async (
  tx: SqlExecutor,
  table: 'Project' | 'Workspace',
  id: string,
  actor: TenantScope,
  minimum: OrganizationRole,
): Promise<string | null> => {
  const rows = await tx.query<{ organizationId: string }>(
    `SELECT t."organizationId" FROM "${table}" t JOIN "Organization" o ON o."id" = t."organizationId" AND o."deletedAt" IS NULL
     WHERE t."id" = $1 AND t."deletedAt" IS NULL`,
    [id],
  );
  const organizationId = rows[0]?.organizationId;
  if (!organizationId) return null;
  await lockOrganization(tx, organizationId);
  await assertRole(tx, organizationId, actor, minimum);
  return organizationId;
};

// Parent rows are share-locked while a child is written, and archiving updates the parent first, so a
// child can never be created under (or moved into) a parent that is being archived. Lock order is
// always organization, then project, then workspace.
// Every tenancy write of one organization queues on this lock, so quota counts cannot be raced and role
// rechecks hold until commit. Do not weaken it to FOR SHARE: new share lockers overtake a waiting
// revocation, which continuous writes can then postpone indefinitely.
const lockOrganization = async (
  tx: SqlExecutor,
  id: string,
): Promise<{ ownerUserId: string | null }> => {
  const rows = await tx.query<{ ownerUserId: string | null }>(
    `SELECT "ownerUserId" FROM "Organization" WHERE "id" = $1 AND "deletedAt" IS NULL FOR NO KEY UPDATE`,
    [id],
  );
  if (!rows[0]) throw new MissingParentError('organization');
  return rows[0];
};
const lockProject = async (tx: SqlExecutor, id: string, organizationId: string): Promise<void> => {
  const rows = await tx.query(
    `SELECT 1 FROM "Project" WHERE "id" = $1 AND "organizationId" = $2 AND "deletedAt" IS NULL FOR SHARE`,
    [id, organizationId],
  );
  if (!rows.length) throw new MissingParentError('project');
};

const MEMBER_SELECT = `SELECT m."organizationId", m."userId", u."email", u."name", r."slug" AS "role", m."status"::text AS "status",
  m."createdAt" AT TIME ZONE 'UTC' AS "createdAt", m."updatedAt" AT TIME ZONE 'UTC' AS "updatedAt"
  FROM "Membership" m JOIN "User" u ON u."id" = m."userId" JOIN "Role" r ON r."id" = m."roleId"
  WHERE m."status" IN ('active','suspended') AND u."deletedAt" IS NULL AND m."organizationId" = $1`;
const toMembership = (r: Row): MembershipRecord => ({
  organizationId: String(r.organizationId),
  userId: String(r.userId),
  email: String(r.email),
  name: String(r.name ?? ''),
  role: r.role as MemberRole,
  status: r.status as MembershipRecord['status'],
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});
const findMember = async (db: SqlExecutor, organizationId: string, userId: string) => {
  const rows = await db.query<Row>(`${MEMBER_SELECT} AND m."userId" = $2`, [organizationId, userId]);
  return rows[0] ? toMembership(rows[0]) : null;
};
// Membership roles are per-organization Role rows; the unique (organizationId, slug) makes this safe to race.
const ensureRole = async (tx: SqlExecutor, organizationId: string, role: MemberRole, at: string) => {
  const rows = await tx.query<{ id: string }>(
    `INSERT INTO "Role" ("id","organizationId","name","slug","system","createdAt","updatedAt")
     VALUES (gen_random_uuid(),$1,$2,$2,true,$3,$3)
     ON CONFLICT ("organizationId","slug") DO UPDATE SET "slug" = EXCLUDED."slug" RETURNING "id"`,
    [organizationId, role, at],
  );
  return (rows[0] as { id: string }).id;
};
const upsertMember = async (
  tx: SqlExecutor,
  organizationId: string,
  userId: string,
  role: MemberRole,
  at: string,
  /** Overwrite an existing active/suspended membership instead of leaving it untouched. */
  replace: boolean,
): Promise<boolean> => {
  const roleId = await ensureRole(tx, organizationId, role, at);
  const rows = await tx.query(
    `INSERT INTO "Membership" ("id","userId","organizationId","roleId","status","createdAt","updatedAt")
     VALUES (gen_random_uuid(),$1,$2,$3,'active',$4,$4)
     ON CONFLICT ("userId","organizationId") DO UPDATE SET "roleId" = EXCLUDED."roleId", "status" = 'active', "updatedAt" = EXCLUDED."updatedAt"
     ${replace ? '' : `WHERE "Membership"."status" IN ('removed','invited')`}
     RETURNING "id"`,
    [userId, organizationId, roleId, at],
  );
  return rows.length > 0;
};
/** Call only while holding the organization lock. */
const enforceQuota = async (
  tx: SqlExecutor,
  resource: 'project' | 'workspace' | 'member',
  organizationId: string,
  limit: number,
): Promise<void> => {
  const from = {
    project: `"Project" WHERE "organizationId" = $1 AND "deletedAt" IS NULL`,
    // Rows hidden under an archived project (older data) cannot be managed, so they do not count.
    workspace: `"Workspace" WHERE "organizationId" = $1 AND "deletedAt" IS NULL AND ("projectId" IS NULL OR EXISTS (SELECT 1 FROM "Project" p WHERE p."id" = "Workspace"."projectId" AND p."deletedAt" IS NULL))`,
    member: `"Membership" WHERE "organizationId" = $1 AND "status" IN ('active','suspended')`,
  }[resource];
  const rows = await tx.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${from}`, [
    organizationId,
  ]);
  if (Number(rows[0]?.n ?? 0) >= limit) throw new QuotaExceededError(resource, limit);
};
const parentWhere = (parent?: ParentFilter) =>
  Object.entries(parent ?? {}).filter(([, v]) => v !== undefined) as Array<[string, string]>;

export const createPostgresIdentityRepositories = (
  sql: SqlClient,
  quotas: TenantQuotas = tenantQuotasFromEnv(),
): IdentityRepositories => {
  const one = async <T>(text: string, values: unknown[], map: (r: Row) => T): Promise<T | null> => {
    const rows = await sql.query<Row>(text, values);
    return rows[0] ? map(rows[0]) : null;
  };
  const orgSpec: ListSpec<OrganizationRecord> = {
    table: 'Organization',
    cols: ORG_COLS,
    map: toOrg,
    searchCols: ['name'],
    tenant: orgTenant,
  };
  const projectSpec: ListSpec<ProjectRecord> = {
    table: 'Project',
    cols: PROJECT_COLS,
    map: toProject,
    searchCols: ['name'],
    tenant: viaOrgTenant,
  };
  const workspaceSpec: ListSpec<WorkspaceRecord> = {
    table: 'Workspace',
    cols: WORKSPACE_COLS,
    map: toWorkspace,
    searchCols: ['name'],
    tenant: workspaceTenant,
  };

  return {
    kind: 'postgres',
    users: {
      async create(u) {
        try {
          const r = await one(
            `INSERT INTO "User" ("id","email","name","passwordHash","status","roles","permissions","emailVerifiedAt","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5::"UserStatus",$6::text[],$7::text[],$8,$9,$10) RETURNING ${USER_COLS}`,
            [
              u.id,
              u.email,
              u.name,
              u.passwordHash,
              u.status,
              u.roles,
              u.permissions,
              u.emailVerifiedAt,
              u.createdAt,
              u.updatedAt,
            ],
            toUser,
          );
          return r as UserRecord;
        } catch (e) {
          if (isUnique(e)) throw new DuplicateError('email');
          throw e;
        }
      },
      findById: (id) =>
        one(
          `SELECT ${USER_COLS} FROM "User" WHERE "id" = $1 AND "deletedAt" IS NULL`,
          [id],
          toUser,
        ),
      findByEmail: (email) =>
        one(
          `SELECT ${USER_COLS} FROM "User" WHERE "email" = $1 AND "deletedAt" IS NULL`,
          [email],
          toUser,
        ),
      list: (q) =>
        list(
          sql,
          { table: 'User', cols: USER_COLS, map: toUser, searchCols: ['email', 'name'] },
          q,
        ),
      async activate(id, at, roles, permissions) {
        const done = await one(
          `UPDATE "User" SET "status"='active',"emailVerifiedAt"=$2,"roles"=$3::text[],"permissions"=$4::text[],"updatedAt"=$2
           WHERE "id"=$1 AND "status"='pending' AND "deletedAt" IS NULL RETURNING ${USER_COLS}`,
          [id, at, roles, permissions],
          toUser,
        );
        if (done) return done;
        const existing = await one(
          `SELECT ${USER_COLS} FROM "User" WHERE "id"=$1 AND "deletedAt" IS NULL`,
          [id],
          toUser,
        );
        return existing && existing.status === 'active' ? existing : null;
      },
      async setPasswordHash(id, passwordHash, at) {
        await sql.query(`UPDATE "User" SET "passwordHash"=$2,"updatedAt"=$3 WHERE "id"=$1`, [
          id,
          passwordHash,
          at,
        ]);
      },
      async touchLogin(id, at) {
        await sql.query(`UPDATE "User" SET "lastLoginAt"=$2 WHERE "id"=$1`, [id, at]);
      },
    },
    sessions: {
      async create(s) {
        await sql.query(
          `INSERT INTO "Session" ("id","userId","familyId","refreshTokenHash","userAgent","ipAddress","expiresAt","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            s.id,
            s.userId,
            s.familyId,
            s.refreshTokenHash,
            s.userAgent ?? null,
            s.ipAddress ?? null,
            s.expiresAt,
            s.createdAt,
          ],
        );
      },
      findByRefreshHash: (hash) =>
        one(`SELECT ${SESSION_COLS} FROM "Session" WHERE "refreshTokenHash"=$1`, [hash], toSession),
      async isActive(id, now) {
        const rows = await sql.query(
          `SELECT 1 FROM "Session" WHERE "id"=$1 AND "revokedAt" IS NULL AND "expiresAt" > $2`,
          [id, now],
        );
        return rows.length > 0;
      },
      async rotate(hash, successor, now): Promise<RotationResult> {
        return sql.transaction(async (tx) => {
          // Compare-and-set: under READ COMMITTED a concurrent presenter blocks on this row lock, then
          // re-evaluates `revokedAt IS NULL` and loses, so a refresh token can be consumed exactly once.
          const won = await tx.query<Row>(
            `UPDATE "Session" SET "revokedAt"=$2 WHERE "refreshTokenHash"=$1 AND "revokedAt" IS NULL AND "expiresAt" > $2 RETURNING ${SESSION_COLS}`,
            [hash, now],
          );
          if (won[0]) {
            await tx.query(
              `INSERT INTO "Session" ("id","userId","familyId","refreshTokenHash","userAgent","ipAddress","expiresAt","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [
                successor.id,
                successor.userId,
                successor.familyId,
                successor.refreshTokenHash,
                successor.userAgent ?? null,
                successor.ipAddress ?? null,
                successor.expiresAt,
                successor.createdAt,
              ],
            );
            return { outcome: 'rotated', previous: toSession(won[0]) };
          }
          const seen = await tx.query<Row>(
            `SELECT ${SESSION_COLS} FROM "Session" WHERE "refreshTokenHash"=$1`,
            [hash],
          );
          if (seen[0] && seen[0].revokedAt)
            return { outcome: 'reuse', previous: toSession(seen[0]) };
          return { outcome: 'invalid' };
        });
      },
      async revoke(id, now) {
        await sql.query(
          `UPDATE "Session" SET "revokedAt"=$2 WHERE "id"=$1 AND "revokedAt" IS NULL`,
          [id, now],
        );
      },
      async revokeFamily(familyId, now) {
        return (
          await sql.query(
            `UPDATE "Session" SET "revokedAt"=$2 WHERE "familyId"=$1 AND "revokedAt" IS NULL RETURNING "id"`,
            [familyId, now],
          )
        ).length;
      },
      async revokeAllForUser(userId, now) {
        return (
          await sql.query(
            `UPDATE "Session" SET "revokedAt"=$2 WHERE "userId"=$1 AND "revokedAt" IS NULL RETURNING "id"`,
            [userId, now],
          )
        ).length;
      },
    },
    tokens: {
      async issue(t: OneTimeTokenRecord) {
        await sql.transaction(async (tx) => {
          await tx.query(
            `UPDATE "Token" SET "consumedAt"=$3 WHERE "userId"=$1 AND "type"=$2::"TokenType" AND "consumedAt" IS NULL`,
            [t.userId, t.type, t.createdAt],
          );
          await tx.query(
            `INSERT INTO "Token" ("id","userId","type","tokenHash","expiresAt","createdAt") VALUES ($1,$2,$3::"TokenType",$4,$5,$6)`,
            [t.id, t.userId, t.type, t.tokenHash, t.expiresAt, t.createdAt],
          );
        });
      },
      async consume(type: OneTimeTokenType, tokenHash, now) {
        const r = await sql.query<Row>(
          `UPDATE "Token" SET "consumedAt"=$3 WHERE "type"=$1::"TokenType" AND "tokenHash"=$2 AND "consumedAt" IS NULL AND "expiresAt" > $3
           RETURNING "id","userId","type","tokenHash",${ts('expiresAt')},${ts('consumedAt')},${ts('createdAt')}`,
          [type, tokenHash, now],
        );
        const row = r[0];
        return row
          ? {
              id: String(row.id),
              userId: String(row.userId),
              type: row.type as OneTimeTokenType,
              tokenHash: String(row.tokenHash),
              expiresAt: iso(row.expiresAt),
              consumedAt: isoOrNull(row.consumedAt),
              createdAt: iso(row.createdAt),
            }
          : null;
      },
    },
    audit: {
      async record(e: AuditEntry) {
        await sql.query(
          `INSERT INTO "AuditLog" ("actorUserId","action","resource","resourceId","metadata","ipAddress") VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
          [
            e.actorUserId ?? null,
            e.action,
            e.resource,
            e.resourceId ?? null,
            JSON.stringify(e.metadata ?? {}),
            e.ipAddress ?? null,
          ],
        );
      },
      async list({ action, limit = 100 }) {
        const rows = await sql.query<Row>(
          `SELECT "id","actorUserId","action","resource","resourceId","metadata","ipAddress",${ts('createdAt')} FROM "AuditLog" WHERE ($1::text IS NULL OR "action"=$1) ORDER BY "createdAt" DESC, "id" LIMIT $2`,
          [action ?? null, Math.min(500, Math.max(1, limit))],
        );
        return rows.map((r) => ({
          id: String(r.id),
          actorUserId: r.actorUserId ? String(r.actorUserId) : null,
          action: String(r.action),
          resource: String(r.resource),
          resourceId: r.resourceId ? String(r.resourceId) : null,
          metadata: (r.metadata as Record<string, unknown>) ?? {},
          ipAddress: r.ipAddress ? String(r.ipAddress) : null,
          createdAt: iso(r.createdAt),
        }));
      },
    },
    organizations: {
      async create(o) {
        try {
          return (await one(
            `INSERT INTO "Organization" ("id","name","slug","ownerUserId","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${ORG_COLS}`,
            [o.id, o.name, o.slug, o.ownerUserId, o.createdAt, o.updatedAt],
            toOrg,
          )) as OrganizationRecord;
        } catch (e) {
          if (isUnique(e)) throw new DuplicateError('slug');
          throw e;
        }
      },
      async findById(id, scope) {
        const t = orgTenant(scope, 2);
        return one(
          `SELECT ${ORG_COLS} FROM "Organization" WHERE "id"=$1 AND "deletedAt" IS NULL${t.sql ? ` AND ${t.sql}` : ''}`,
          [id, ...t.values],
          toOrg,
        );
      },
      list: (q, scope) => list(sql, orgSpec, q, scope),
      update: (id, patch, options, actor) =>
        sql.transaction(async (tx) => {
          const live = await tx.query(
            `SELECT 1 FROM "Organization" WHERE "id"=$1 AND "deletedAt" IS NULL FOR NO KEY UPDATE`,
            [id],
          );
          if (!live.length) return null;
          await assertRole(tx, id, actor, 'admin');
          return patchRow(tx, 'Organization', ORG_COLS, toOrg, id, { ...patch }, options);
        }),
      archive: (id, at, actor) =>
        sql.transaction(async (tx) => {
          const live = await tx.query(
            `SELECT 1 FROM "Organization" WHERE "id"=$1 AND "deletedAt" IS NULL FOR UPDATE`,
            [id],
          );
          if (!live.length) return false;
          await assertRole(tx, id, actor, 'owner');
          const r = await tx.query(
            `UPDATE "Organization" SET "deletedAt"=$2,"updatedAt"=$2 WHERE "id"=$1 AND "deletedAt" IS NULL RETURNING "id"`,
            [id, at],
          );
          if (!r.length) return false;
          for (const table of ['Project', 'Workspace'])
            await tx.query(
              `UPDATE "${table}" SET "deletedAt"=$2,"updatedAt"=$2 WHERE "organizationId"=$1 AND "deletedAt" IS NULL`,
              [id, at],
            );
          return true;
        }),
      roleOf: (id, userId) => roleIn(sql, id, userId),
      transferOwnership: (id, newOwnerUserId, at, expectedOwnerUserId) =>
        sql.transaction(async (tx) => {
          const current = await tx.query<{ ownerUserId: string | null }>(
            `SELECT "ownerUserId" FROM "Organization" WHERE "id"=$1 AND "deletedAt" IS NULL FOR UPDATE`,
            [id],
          );
          if (!current[0]) return null;
          if (current[0].ownerUserId !== expectedOwnerUserId) throw new StaleWriteError();
          const member = await findMember(tx, id, newOwnerUserId);
          if (member?.status !== 'active') return null;
          await tx.query(
            `UPDATE "Membership" SET "status"='removed',"updatedAt"=$3 WHERE "organizationId"=$1 AND "userId"=$2`,
            [id, newOwnerUserId, at],
          );
          const previous = current[0].ownerUserId;
          if (previous) await upsertMember(tx, id, previous, 'admin', at, true);
          return patchRow(tx, 'Organization', ORG_COLS, toOrg, id, { ownerUserId: newOwnerUserId }, { at });
        }),
    },
    memberships: {
      async list(organizationId, q) {
        const values: unknown[] = [organizationId];
        let search = '';
        if (q.search) {
          values.push(like(q.search));
          search = ` AND (u."email"::text ILIKE $2 OR u."name" ILIKE $2)`;
        }
        const order = q.sort === 'name' || q.sort === 'email' ? `u."${q.sort}"` : 'm."createdAt"';
        const total = await sql.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM (${MEMBER_SELECT}${search}) t`,
          values,
        );
        const rows = await sql.query<Row>(
          `${MEMBER_SELECT}${search} ORDER BY ${order} ${q.order === 'asc' ? 'ASC' : 'DESC'}, m."id" LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
          values,
        );
        return { items: rows.map(toMembership), total: Number(total[0]?.n ?? 0), page: q.page, pageSize: q.pageSize };
      },
      find: (organizationId, userId) => findMember(sql, organizationId, userId),
      add: (organizationId, userId, role, at, actor) =>
        sql.transaction(async (tx) => {
          const org = await lockOrganization(tx, organizationId);
          await assertRole(tx, organizationId, actor, 'admin');
          if (org.ownerUserId === userId) throw new DuplicateError('member');
          const existing = await findMember(tx, organizationId, userId);
          if (existing) throw new DuplicateError('member');
          await enforceQuota(tx, 'member', organizationId, quotas.maxMembers);
          if (!(await upsertMember(tx, organizationId, userId, role, at, false)))
            throw new DuplicateError('member');
          return (await findMember(tx, organizationId, userId)) as MembershipRecord;
        }),
      update: (organizationId, userId, patch, { at, expectedUpdatedAt }, actor) =>
        sql.transaction(async (tx) => {
          await lockOrganization(tx, organizationId);
          await assertRole(tx, organizationId, actor, 'admin');
          const current = await findMember(tx, organizationId, userId);
          if (!current) return null;
          if (expectedUpdatedAt && Date.parse(expectedUpdatedAt) !== Date.parse(current.updatedAt))
            throw new StaleWriteError();
          const roleId = patch.role ? await ensureRole(tx, organizationId, patch.role, at) : null;
          await tx.query(
            `UPDATE "Membership" SET "roleId" = COALESCE($3, "roleId"), "status" = COALESCE($4::"MembershipStatus", "status"),
             "updatedAt" = GREATEST($5::timestamp(3), "updatedAt" + interval '1 millisecond')
             WHERE "organizationId" = $1 AND "userId" = $2 AND "status" IN ('active','suspended')`,
            [organizationId, userId, roleId, patch.status ?? null, at],
          );
          return findMember(tx, organizationId, userId);
        }),
      remove: (organizationId, userId, at, actor) =>
        sql.transaction(async (tx) => {
          // Waits for writes the member has in flight, and for any ownership transfer.
          await lockOrganization(tx, organizationId);
          const self = actor.kind === 'user' && actor.userId === userId;
          await assertRole(tx, organizationId, actor, self ? 'viewer' : 'admin');
          const r = await tx.query(
            `UPDATE "Membership" SET "status"='removed',"updatedAt"=$3 WHERE "organizationId"=$1 AND "userId"=$2 AND "status" <> 'removed' RETURNING "id"`,
            [organizationId, userId, at],
          );
          return r.length > 0;
        }),
    },
    projects: {
      async create(p, actor) {
        try {
          return await sql.transaction(async (tx) => {
            await lockOrganization(tx, p.organizationId);
            await assertRole(tx, p.organizationId, actor, 'member');
            await enforceQuota(tx, 'project', p.organizationId, quotas.maxProjects);
            const rows = await tx.query<Row>(
            `INSERT INTO "Project" ("id","organizationId","name","slug","description","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${PROJECT_COLS}`,
            [
              p.id,
              p.organizationId,
              p.name,
              p.slug,
              p.description ?? null,
              p.createdAt,
              p.updatedAt,
            ],
            );
            return toProject(rows[0] as Row);
          });
        } catch (e) {
          if (isUnique(e)) throw new DuplicateError('slug');
          throw e;
        }
      },
      async findById(id, scope) {
        const t = viaOrgTenant(scope, 2);
        return one(
          `SELECT ${PROJECT_COLS} FROM "Project" WHERE "id"=$1 AND "deletedAt" IS NULL${t.sql ? ` AND ${t.sql}` : ''}`,
          [id, ...t.values],
          toProject,
        );
      },
      list: (q, scope, parent) => list(sql, projectSpec, q, scope, parent),
      update: (id, patch, options, actor) =>
        sql.transaction(async (tx) => {
          if (!(await lockOwnerOf(tx, 'Project', id, actor, 'member'))) return null;
          return patchRow(tx, 'Project', PROJECT_COLS, toProject, id, { ...patch }, options);
        }),
      archive: (id, at, actor) =>
        sql.transaction(async (tx) => {
          if (!(await lockOwnerOf(tx, 'Project', id, actor, 'admin'))) return false;
          const r = await tx.query(
            `UPDATE "Project" SET "deletedAt"=$2,"updatedAt"=$2 WHERE "id"=$1 AND "deletedAt" IS NULL RETURNING "id"`,
            [id, at],
          );
          if (!r.length) return false;
          await tx.query(
            `UPDATE "Workspace" SET "deletedAt"=$2,"updatedAt"=$2 WHERE "projectId"=$1 AND "deletedAt" IS NULL`,
            [id, at],
          );
          return true;
        }),
    },
    workspaces: {
      async create(w, actor) {
        try {
          return await sql.transaction(async (tx) => {
            await lockOrganization(tx, w.organizationId);
            await assertRole(tx, w.organizationId, actor, 'member');
            await enforceQuota(tx, 'workspace', w.organizationId, quotas.maxWorkspaces);
            if (w.projectId) await lockProject(tx, w.projectId, w.organizationId);
            const rows = await tx.query<Row>(
            `INSERT INTO "Workspace" ("id","organizationId","projectId","name","slug","environment","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${WORKSPACE_COLS}`,
            [
              w.id,
              w.organizationId,
              w.projectId ?? null,
              w.name,
              w.slug,
              w.environment,
              w.createdAt,
              w.updatedAt,
            ],
            );
            return toWorkspace(rows[0] as Row);
          });
        } catch (e) {
          if (isUnique(e)) throw new DuplicateError('slug');
          throw e;
        }
      },
      async findById(id, scope) {
        const t = workspaceTenant(scope, 2);
        return one(
          `SELECT ${WORKSPACE_COLS} FROM "Workspace" WHERE "id"=$1 AND "deletedAt" IS NULL${t.sql ? ` AND ${t.sql}` : ''}`,
          [id, ...t.values],
          toWorkspace,
        );
      },
      list: (q, scope, parent) => list(sql, workspaceSpec, q, scope, parent),
      update: (id, patch, options, actor) =>
        sql.transaction(async (tx) => {
          const organizationId = await lockOwnerOf(tx, 'Workspace', id, actor, 'member');
          if (!organizationId) return null;
          if (patch.projectId) await lockProject(tx, patch.projectId, organizationId);
          return patchRow(tx, 'Workspace', WORKSPACE_COLS, toWorkspace, id, { ...patch }, options);
        }),
      archive: (id, at, actor) =>
        sql.transaction(async (tx) => {
          if (!(await lockOwnerOf(tx, 'Workspace', id, actor, 'admin'))) return false;
          const r = await tx.query(
            `UPDATE "Workspace" SET "deletedAt"=$2,"updatedAt"=$2 WHERE "id"=$1 AND "deletedAt" IS NULL RETURNING "id"`,
            [id, at],
          );
          return r.length > 0;
        }),
    },
    rateLimits: {
      async hit(key, max, windowMs): Promise<RateLimitDecision> {
        // One atomic upsert using the database clock, so every API instance shares the same window.
        const rows = await sql.query<{ count: number; resetMs: number }>(
          `INSERT INTO "RateLimitBucket" ("key","count","resetAt")
           VALUES ($1, 1, (now() AT TIME ZONE 'UTC') + make_interval(secs => $2::float8))
           ON CONFLICT ("key") DO UPDATE SET
             "count" = CASE WHEN "RateLimitBucket"."resetAt" <= (now() AT TIME ZONE 'UTC') THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
             "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= (now() AT TIME ZONE 'UTC') THEN (now() AT TIME ZONE 'UTC') + make_interval(secs => $2::float8) ELSE "RateLimitBucket"."resetAt" END
           RETURNING "count", (EXTRACT(EPOCH FROM ("resetAt" AT TIME ZONE 'UTC')) * 1000)::float8 AS "resetMs"`,
          [key, windowMs / 1000],
        );
        const r = rows[0] as { count: number; resetMs: number };
        return {
          allowed: r.count <= max,
          limit: max,
          remaining: Math.max(0, max - r.count),
          resetAt: Number(r.resetMs),
        };
      },
      async peek(key) {
        const rows = await sql.query<{ count: number; resetMs: number }>(
          `SELECT "count", (EXTRACT(EPOCH FROM ("resetAt" AT TIME ZONE 'UTC')) * 1000)::float8 AS "resetMs" FROM "RateLimitBucket" WHERE "key"=$1 AND "resetAt" > (now() AT TIME ZONE 'UTC')`,
          [key],
        );
        return rows[0] ? { count: rows[0].count, resetAt: Number(rows[0].resetMs) } : null;
      },
      async reset(key) {
        await sql.query(`DELETE FROM "RateLimitBucket" WHERE "key"=$1`, [key]);
      },
    },
    retention: {
      async purgeExpired(policy: RetentionPolicy, now = new Date()): Promise<RetentionResult> {
        // ISO strings, not Date objects: node-pg renders a Date in the process's local zone, which Postgres
        // would then compare against UTC `timestamp` columns with the offset silently dropped.
        const cutoff = new Date(now.getTime() - policy.graceMs).toISOString();
        const count = async (text: string, params: unknown[]): Promise<number> => {
          const rows = await sql.query<{ n: string }>(
            `WITH d AS (${text} RETURNING 1) SELECT count(*)::text AS n FROM d`,
            params,
          );
          return Number((rows[0] as { n: string }).n);
        };
        // Sessions are only removed once their refresh token could no longer be presented (expired + grace),
        // so revoked-session reuse detection keeps working for the token's whole lifetime. Session-bound tokens cascade; one-time tokens have no session, so they are purged by their own expiry below.
        const sessions = await count(`DELETE FROM "Session" WHERE "expiresAt" < $1`, [cutoff]);
        const tokens = await count(`DELETE FROM "Token" WHERE "expiresAt" < $1`, [cutoff]);
        const rateLimitBuckets = await count(`DELETE FROM "RateLimitBucket" WHERE "resetAt" < $1`, [
          now.toISOString(),
        ]);
        const auditLogs =
          policy.auditRetentionMs == null
            ? 0
            : await count(`DELETE FROM "AuditLog" WHERE "createdAt" < $1`, [
                new Date(now.getTime() - policy.auditRetentionMs).toISOString(),
              ]);
        return { sessions, tokens, rateLimitBuckets, auditLogs };
      },
    },
    async ping() {
      await sql.query('SELECT 1');
    },
    async close() {
      await sql.end();
    },
  };
};
