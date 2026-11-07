import { DuplicateError, } from './types.js';
const iso = (v) => (v instanceof Date ? v.toISOString() : String(v));
const isoOrNull = (v) => (v == null ? null : iso(v));
// Timestamps are stored as UTC `timestamp(3)`; reading them via AT TIME ZONE 'UTC' yields an unambiguous instant.
const ts = (col, alias = col) => `"${col}" AT TIME ZONE 'UTC' AS "${alias}"`;
const isUnique = (e) => typeof e === 'object' && e !== null && e.code === '23505';
const USER_COLS = `"id","email","name","passwordHash","status","roles","permissions",${ts('emailVerifiedAt')},${ts('lastLoginAt')},${ts('createdAt')},${ts('updatedAt')},${ts('deletedAt')}`;
const SESSION_COLS = `"id","userId","familyId","refreshTokenHash","userAgent","ipAddress",${ts('expiresAt')},${ts('revokedAt')},${ts('createdAt')}`;
const ORG_COLS = `"id","name","slug","ownerUserId",${ts('createdAt')},${ts('updatedAt')},${ts('deletedAt')}`;
const PROJECT_COLS = `"id","organizationId","name","slug","description",${ts('createdAt')},${ts('updatedAt')},${ts('deletedAt')}`;
const WORKSPACE_COLS = `"id","organizationId","projectId","name","slug","environment",${ts('createdAt')},${ts('updatedAt')},${ts('deletedAt')}`;
const toUser = (r) => ({
    id: String(r.id),
    email: String(r.email),
    name: String(r.name ?? ''),
    passwordHash: String(r.passwordHash),
    status: r.status,
    roles: r.roles ?? [],
    permissions: r.permissions ?? [],
    emailVerifiedAt: isoOrNull(r.emailVerifiedAt),
    lastLoginAt: isoOrNull(r.lastLoginAt),
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    deletedAt: isoOrNull(r.deletedAt),
});
const toSession = (r) => ({
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
const toOrg = (r) => ({
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
    ownerUserId: r.ownerUserId ? String(r.ownerUserId) : null,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    deletedAt: isoOrNull(r.deletedAt),
});
const toProject = (r) => ({
    id: String(r.id),
    organizationId: String(r.organizationId),
    name: String(r.name),
    slug: String(r.slug),
    ...(r.description ? { description: String(r.description) } : {}),
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    deletedAt: isoOrNull(r.deletedAt),
});
const toWorkspace = (r) => ({
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
const ORDER = {
    createdAt: '"createdAt"',
    updatedAt: '"updatedAt"',
    name: '"name"',
    slug: '"slug"',
    email: '"email"',
};
const like = (s) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const list = async (db, spec, q, scope) => {
    const where = ['"deletedAt" IS NULL'];
    const values = [];
    if (scope && spec.tenant) {
        const t = spec.tenant(scope, values.length + 1);
        if (t.sql)
            where.push(t.sql);
        values.push(...t.values);
    }
    if (q.search) {
        values.push(like(q.search));
        where.push(`(${spec.searchCols.map((c) => `"${c}"::text ILIKE $${values.length}`).join(' OR ')})`);
    }
    const w = where.join(' AND ');
    const order = ORDER[q.sort] ?? ORDER.createdAt;
    const total = await db.query(`SELECT count(*)::text AS n FROM "${spec.table}" WHERE ${w}`, values);
    const rows = await db.query(`SELECT ${spec.cols} FROM "${spec.table}" WHERE ${w} ORDER BY ${order} ${q.order === 'asc' ? 'ASC' : 'DESC'}, "id" LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`, values);
    return {
        items: rows.map(spec.map),
        total: Number(total[0]?.n ?? 0),
        page: q.page,
        pageSize: q.pageSize,
    };
};
const orgTenant = (scope, idx) => scope.kind === 'all'
    ? { sql: '', values: [] }
    : { sql: `"ownerUserId" = $${idx}`, values: [scope.userId] };
const viaOrgTenant = (scope, idx) => scope.kind === 'all'
    ? { sql: '', values: [] }
    : {
        sql: `"organizationId" IN (SELECT "id" FROM "Organization" WHERE "deletedAt" IS NULL AND "ownerUserId" = $${idx})`,
        values: [scope.userId],
    };
export const createPostgresIdentityRepositories = (sql) => {
    const one = async (text, values, map) => {
        const rows = await sql.query(text, values);
        return rows[0] ? map(rows[0]) : null;
    };
    const orgSpec = {
        table: 'Organization',
        cols: ORG_COLS,
        map: toOrg,
        searchCols: ['name'],
        tenant: orgTenant,
    };
    const projectSpec = {
        table: 'Project',
        cols: PROJECT_COLS,
        map: toProject,
        searchCols: ['name'],
        tenant: viaOrgTenant,
    };
    const workspaceSpec = {
        table: 'Workspace',
        cols: WORKSPACE_COLS,
        map: toWorkspace,
        searchCols: ['name'],
        tenant: viaOrgTenant,
    };
    return {
        kind: 'postgres',
        users: {
            async create(u) {
                try {
                    const r = await one(`INSERT INTO "User" ("id","email","name","passwordHash","status","roles","permissions","emailVerifiedAt","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5::"UserStatus",$6::text[],$7::text[],$8,$9,$10) RETURNING ${USER_COLS}`, [
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
                    ], toUser);
                    return r;
                }
                catch (e) {
                    if (isUnique(e))
                        throw new DuplicateError('email');
                    throw e;
                }
            },
            findById: (id) => one(`SELECT ${USER_COLS} FROM "User" WHERE "id" = $1 AND "deletedAt" IS NULL`, [id], toUser),
            findByEmail: (email) => one(`SELECT ${USER_COLS} FROM "User" WHERE "email" = $1 AND "deletedAt" IS NULL`, [email], toUser),
            list: (q) => list(sql, { table: 'User', cols: USER_COLS, map: toUser, searchCols: ['email', 'name'] }, q),
            async activate(id, at, roles, permissions) {
                const done = await one(`UPDATE "User" SET "status"='active',"emailVerifiedAt"=$2,"roles"=$3::text[],"permissions"=$4::text[],"updatedAt"=$2
           WHERE "id"=$1 AND "status"='pending' AND "deletedAt" IS NULL RETURNING ${USER_COLS}`, [id, at, roles, permissions], toUser);
                if (done)
                    return done;
                const existing = await one(`SELECT ${USER_COLS} FROM "User" WHERE "id"=$1 AND "deletedAt" IS NULL`, [id], toUser);
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
                await sql.query(`INSERT INTO "Session" ("id","userId","familyId","refreshTokenHash","userAgent","ipAddress","expiresAt","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
                    s.id,
                    s.userId,
                    s.familyId,
                    s.refreshTokenHash,
                    s.userAgent ?? null,
                    s.ipAddress ?? null,
                    s.expiresAt,
                    s.createdAt,
                ]);
            },
            findByRefreshHash: (hash) => one(`SELECT ${SESSION_COLS} FROM "Session" WHERE "refreshTokenHash"=$1`, [hash], toSession),
            async isActive(id, now) {
                const rows = await sql.query(`SELECT 1 FROM "Session" WHERE "id"=$1 AND "revokedAt" IS NULL AND "expiresAt" > $2`, [id, now]);
                return rows.length > 0;
            },
            async rotate(hash, successor, now) {
                return sql.transaction(async (tx) => {
                    // Compare-and-set: under READ COMMITTED a concurrent presenter blocks on this row lock, then
                    // re-evaluates `revokedAt IS NULL` and loses, so a refresh token can be consumed exactly once.
                    const won = await tx.query(`UPDATE "Session" SET "revokedAt"=$2 WHERE "refreshTokenHash"=$1 AND "revokedAt" IS NULL AND "expiresAt" > $2 RETURNING ${SESSION_COLS}`, [hash, now]);
                    if (won[0]) {
                        await tx.query(`INSERT INTO "Session" ("id","userId","familyId","refreshTokenHash","userAgent","ipAddress","expiresAt","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
                            successor.id,
                            successor.userId,
                            successor.familyId,
                            successor.refreshTokenHash,
                            successor.userAgent ?? null,
                            successor.ipAddress ?? null,
                            successor.expiresAt,
                            successor.createdAt,
                        ]);
                        return { outcome: 'rotated', previous: toSession(won[0]) };
                    }
                    const seen = await tx.query(`SELECT ${SESSION_COLS} FROM "Session" WHERE "refreshTokenHash"=$1`, [hash]);
                    if (seen[0] && seen[0].revokedAt)
                        return { outcome: 'reuse', previous: toSession(seen[0]) };
                    return { outcome: 'invalid' };
                });
            },
            async revoke(id, now) {
                await sql.query(`UPDATE "Session" SET "revokedAt"=$2 WHERE "id"=$1 AND "revokedAt" IS NULL`, [id, now]);
            },
            async revokeFamily(familyId, now) {
                return (await sql.query(`UPDATE "Session" SET "revokedAt"=$2 WHERE "familyId"=$1 AND "revokedAt" IS NULL RETURNING "id"`, [familyId, now])).length;
            },
            async revokeAllForUser(userId, now) {
                return (await sql.query(`UPDATE "Session" SET "revokedAt"=$2 WHERE "userId"=$1 AND "revokedAt" IS NULL RETURNING "id"`, [userId, now])).length;
            },
        },
        tokens: {
            async issue(t) {
                await sql.transaction(async (tx) => {
                    await tx.query(`UPDATE "Token" SET "consumedAt"=$3 WHERE "userId"=$1 AND "type"=$2::"TokenType" AND "consumedAt" IS NULL`, [t.userId, t.type, t.createdAt]);
                    await tx.query(`INSERT INTO "Token" ("id","userId","type","tokenHash","expiresAt","createdAt") VALUES ($1,$2,$3::"TokenType",$4,$5,$6)`, [t.id, t.userId, t.type, t.tokenHash, t.expiresAt, t.createdAt]);
                });
            },
            async consume(type, tokenHash, now) {
                const r = await sql.query(`UPDATE "Token" SET "consumedAt"=$3 WHERE "type"=$1::"TokenType" AND "tokenHash"=$2 AND "consumedAt" IS NULL AND "expiresAt" > $3
           RETURNING "id","userId","type","tokenHash",${ts('expiresAt')},${ts('consumedAt')},${ts('createdAt')}`, [type, tokenHash, now]);
                const row = r[0];
                return row
                    ? {
                        id: String(row.id),
                        userId: String(row.userId),
                        type: row.type,
                        tokenHash: String(row.tokenHash),
                        expiresAt: iso(row.expiresAt),
                        consumedAt: isoOrNull(row.consumedAt),
                        createdAt: iso(row.createdAt),
                    }
                    : null;
            },
        },
        audit: {
            async record(e) {
                await sql.query(`INSERT INTO "AuditLog" ("actorUserId","action","resource","resourceId","metadata","ipAddress") VALUES ($1,$2,$3,$4,$5::jsonb,$6)`, [
                    e.actorUserId ?? null,
                    e.action,
                    e.resource,
                    e.resourceId ?? null,
                    JSON.stringify(e.metadata ?? {}),
                    e.ipAddress ?? null,
                ]);
            },
            async list({ action, limit = 100 }) {
                const rows = await sql.query(`SELECT "id","actorUserId","action","resource","resourceId","metadata","ipAddress",${ts('createdAt')} FROM "AuditLog" WHERE ($1::text IS NULL OR "action"=$1) ORDER BY "createdAt" DESC, "id" LIMIT $2`, [action ?? null, Math.min(500, Math.max(1, limit))]);
                return rows.map((r) => ({
                    id: String(r.id),
                    actorUserId: r.actorUserId ? String(r.actorUserId) : null,
                    action: String(r.action),
                    resource: String(r.resource),
                    resourceId: r.resourceId ? String(r.resourceId) : null,
                    metadata: r.metadata ?? {},
                    ipAddress: r.ipAddress ? String(r.ipAddress) : null,
                    createdAt: iso(r.createdAt),
                }));
            },
        },
        organizations: {
            async create(o) {
                try {
                    return (await one(`INSERT INTO "Organization" ("id","name","slug","ownerUserId","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${ORG_COLS}`, [o.id, o.name, o.slug, o.ownerUserId, o.createdAt, o.updatedAt], toOrg));
                }
                catch (e) {
                    if (isUnique(e))
                        throw new DuplicateError('slug');
                    throw e;
                }
            },
            async findById(id, scope) {
                const t = orgTenant(scope, 2);
                return one(`SELECT ${ORG_COLS} FROM "Organization" WHERE "id"=$1 AND "deletedAt" IS NULL${t.sql ? ` AND ${t.sql}` : ''}`, [id, ...t.values], toOrg);
            },
            list: (q, scope) => list(sql, orgSpec, q, scope),
            async softDelete(id, scope, at) {
                const t = orgTenant(scope, 3);
                const r = await sql.query(`UPDATE "Organization" SET "deletedAt"=$2,"updatedAt"=$2 WHERE "id"=$1 AND "deletedAt" IS NULL${t.sql ? ` AND ${t.sql}` : ''} RETURNING "id"`, [id, at, ...t.values]);
                return r.length > 0;
            },
        },
        projects: {
            async create(p) {
                try {
                    return (await one(`INSERT INTO "Project" ("id","organizationId","name","slug","description","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${PROJECT_COLS}`, [
                        p.id,
                        p.organizationId,
                        p.name,
                        p.slug,
                        p.description ?? null,
                        p.createdAt,
                        p.updatedAt,
                    ], toProject));
                }
                catch (e) {
                    if (isUnique(e))
                        throw new DuplicateError('slug');
                    throw e;
                }
            },
            async findById(id, scope) {
                const t = viaOrgTenant(scope, 2);
                return one(`SELECT ${PROJECT_COLS} FROM "Project" WHERE "id"=$1 AND "deletedAt" IS NULL${t.sql ? ` AND ${t.sql}` : ''}`, [id, ...t.values], toProject);
            },
            list: (q, scope) => list(sql, projectSpec, q, scope),
        },
        workspaces: {
            async create(w) {
                try {
                    return (await one(`INSERT INTO "Workspace" ("id","organizationId","projectId","name","slug","environment","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${WORKSPACE_COLS}`, [
                        w.id,
                        w.organizationId,
                        w.projectId ?? null,
                        w.name,
                        w.slug,
                        w.environment,
                        w.createdAt,
                        w.updatedAt,
                    ], toWorkspace));
                }
                catch (e) {
                    if (isUnique(e))
                        throw new DuplicateError('slug');
                    throw e;
                }
            },
            async findById(id, scope) {
                const t = viaOrgTenant(scope, 2);
                return one(`SELECT ${WORKSPACE_COLS} FROM "Workspace" WHERE "id"=$1 AND "deletedAt" IS NULL${t.sql ? ` AND ${t.sql}` : ''}`, [id, ...t.values], toWorkspace);
            },
            list: (q, scope) => list(sql, workspaceSpec, q, scope),
        },
        rateLimits: {
            async hit(key, max, windowMs) {
                // One atomic upsert using the database clock, so every API instance shares the same window.
                const rows = await sql.query(`INSERT INTO "RateLimitBucket" ("key","count","resetAt")
           VALUES ($1, 1, (now() AT TIME ZONE 'UTC') + make_interval(secs => $2::float8))
           ON CONFLICT ("key") DO UPDATE SET
             "count" = CASE WHEN "RateLimitBucket"."resetAt" <= (now() AT TIME ZONE 'UTC') THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
             "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= (now() AT TIME ZONE 'UTC') THEN (now() AT TIME ZONE 'UTC') + make_interval(secs => $2::float8) ELSE "RateLimitBucket"."resetAt" END
           RETURNING "count", (EXTRACT(EPOCH FROM ("resetAt" AT TIME ZONE 'UTC')) * 1000)::float8 AS "resetMs"`, [key, windowMs / 1000]);
                const r = rows[0];
                return {
                    allowed: r.count <= max,
                    limit: max,
                    remaining: Math.max(0, max - r.count),
                    resetAt: Number(r.resetMs),
                };
            },
            async peek(key) {
                const rows = await sql.query(`SELECT "count", (EXTRACT(EPOCH FROM ("resetAt" AT TIME ZONE 'UTC')) * 1000)::float8 AS "resetMs" FROM "RateLimitBucket" WHERE "key"=$1 AND "resetAt" > (now() AT TIME ZONE 'UTC')`, [key]);
                return rows[0] ? { count: rows[0].count, resetAt: Number(rows[0].resetMs) } : null;
            },
            async reset(key) {
                await sql.query(`DELETE FROM "RateLimitBucket" WHERE "key"=$1`, [key]);
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
//# sourceMappingURL=postgres.js.map