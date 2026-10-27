import { createHash } from 'node:crypto';
import type { DatabaseClient } from '@irp/database';

export type PaginationQuery = {
  page: number;
  pageSize: number;
  sort: string;
  order: 'asc' | 'desc';
  search?: string;
};

export type UserRecord = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  status: 'pending' | 'active' | 'suspended';
  emailVerifiedAt?: string | null;
  roles: string[];
  permissions: string[];
  createdAt: string;
  updatedAt: string;
};

export type OrganizationRecord = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type ProjectRecord = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type WorkspaceRecord = {
  id: string;
  organizationId: string;
  projectId?: string;
  name: string;
  slug: string;
  environment: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type SessionRecord = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: string;
  revokedAt?: string | null;
};

export type ListResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

const asDateString = (value: Date | string | null | undefined): string | null =>
  value == null ? null : value instanceof Date ? value.toISOString() : value;

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

const normalizeUser = (row: Record<string, unknown>): UserRecord => ({
  id: String(row.id),
  email: String(row.email),
  name: row.name == null ? '' : String(row.name),
  passwordHash: String(row.passwordHash),
  status: String(row.status) as UserRecord['status'],
  emailVerifiedAt: asDateString(row.emailVerifiedAt),
  roles: [],
  permissions: [],
  createdAt: asDateString(row.createdAt) ?? new Date(0).toISOString(),
  updatedAt: asDateString(row.updatedAt) ?? new Date(0).toISOString(),
});

const normalizeOrganization = (row: Record<string, unknown>): OrganizationRecord => ({
  id: String(row.id),
  name: String(row.name),
  slug: String(row.slug),
  createdAt: asDateString(row.createdAt) ?? new Date(0).toISOString(),
  updatedAt: asDateString(row.updatedAt) ?? new Date(0).toISOString(),
  deletedAt: asDateString(row.deletedAt),
});

const normalizeProject = (row: Record<string, unknown>): ProjectRecord => ({
  id: String(row.id),
  organizationId: String(row.organizationId),
  name: String(row.name),
  slug: String(row.slug),
  description: row.description == null ? undefined : String(row.description),
  createdAt: asDateString(row.createdAt) ?? new Date(0).toISOString(),
  updatedAt: asDateString(row.updatedAt) ?? new Date(0).toISOString(),
  deletedAt: asDateString(row.deletedAt),
});

const normalizeWorkspace = (row: Record<string, unknown>): WorkspaceRecord => ({
  id: String(row.id),
  organizationId: String(row.organizationId),
  projectId: row.projectId == null ? undefined : String(row.projectId),
  name: String(row.name),
  slug: String(row.slug),
  environment: String(row.environment),
  createdAt: asDateString(row.createdAt) ?? new Date(0).toISOString(),
  updatedAt: asDateString(row.updatedAt) ?? new Date(0).toISOString(),
  deletedAt: asDateString(row.deletedAt),
});

const normalizeSession = (row: Record<string, unknown>): SessionRecord => ({
  id: String(row.id),
  userId: String(row.userId),
  refreshTokenHash: String(row.refreshTokenHash),
  expiresAt: asDateString(row.expiresAt) ?? new Date(0).toISOString(),
  revokedAt: asDateString(row.revokedAt),
});

const order = (query: PaginationQuery): 'ASC' | 'DESC' => query.order === 'asc' ? 'ASC' : 'DESC';
const offset = (query: PaginationQuery): number => Math.max(0, (query.page - 1) * query.pageSize);
const limit = (query: PaginationQuery): number => Math.min(100, Math.max(1, query.pageSize));

const userSort = (query: PaginationQuery): 'createdAt' | 'email' | 'name' | 'status' => {
  if (query.sort === 'email' || query.sort === 'name' || query.sort === 'status') return query.sort;
  return 'createdAt';
};
const orgSort = (query: PaginationQuery): 'createdAt' | 'name' | 'slug' => {
  if (query.sort === 'name' || query.sort === 'slug') return query.sort;
  return 'createdAt';
};
const projectSort = (query: PaginationQuery): 'createdAt' | 'name' | 'slug' => {
  if (query.sort === 'name' || query.sort === 'slug') return query.sort;
  return 'createdAt';
};
const workspaceSort = (query: PaginationQuery): 'createdAt' | 'name' | 'slug' | 'environment' => {
  if (query.sort === 'name' || query.sort === 'slug' || query.sort === 'environment') return query.sort;
  return 'createdAt';
};

export const createDurableRepositories = (db: Pick<DatabaseClient, '$queryRaw'>) => {
  const users = {
    async findByEmail(email: string): Promise<UserRecord | null> {
      const rows = await db.$queryRaw`SELECT "id","email","name","passwordHash","status","emailVerifiedAt","createdAt","updatedAt" FROM "User" WHERE "email" = ${email} AND "deletedAt" IS NULL LIMIT 1`;
      const row = (rows as Record<string, unknown>[])[0];
      return row ? normalizeUser(row) : null;
    },
    async get(id: string): Promise<UserRecord | null> {
      const rows = await db.$queryRaw`SELECT "id","email","name","passwordHash","status","emailVerifiedAt","createdAt","updatedAt" FROM "User" WHERE "id" = ${id} AND "deletedAt" IS NULL LIMIT 1`;
      const row = (rows as Record<string, unknown>[])[0];
      return row ? normalizeUser(row) : null;
    },
    async list(query: PaginationQuery, search?: string): Promise<ListResult<UserRecord>> {
      const s = userSort(query);
      const o = order(query);
      const q = search?.trim() || null;
      const rows = s === 'email'
        ? (o === 'ASC'
          ? await db.$queryRaw`SELECT "id","email","name","passwordHash","status","emailVerifiedAt","createdAt","updatedAt" FROM "User" WHERE "deletedAt" IS NULL AND (${q}::text IS NULL OR "email" ILIKE ${q ? `%${q}%` : null}) ORDER BY "email" ASC OFFSET ${offset(query)} LIMIT ${limit(query)}`
          : await db.$queryRaw`SELECT "id","email","name","passwordHash","status","emailVerifiedAt","createdAt","updatedAt" FROM "User" WHERE "deletedAt" IS NULL AND (${q}::text IS NULL OR "email" ILIKE ${q ? `%${q}%` : null}) ORDER BY "email" DESC OFFSET ${offset(query)} LIMIT ${limit(query)}`)
        : s === 'name'
          ? (o === 'ASC'
            ? await db.$queryRaw`SELECT "id","email","name","passwordHash","status","emailVerifiedAt","createdAt","updatedAt" FROM "User" WHERE "deletedAt" IS NULL AND (${q}::text IS NULL OR "email" ILIKE ${q ? `%${q}%` : null} OR "name" ILIKE ${q ? `%${q}%` : null}) ORDER BY "name" ASC OFFSET ${offset(query)} LIMIT ${limit(query)}`
            : await db.$queryRaw`SELECT "id","email","name","passwordHash","status","emailVerifiedAt","createdAt","updatedAt" FROM "User" WHERE "deletedAt" IS NULL AND (${q}::text IS NULL OR "email" ILIKE ${q ? `%${q}%` : null} OR "name" ILIKE ${q ? `%${q}%` : null}) ORDER BY "name" DESC OFFSET ${offset(query)} LIMIT ${limit(query)}`)
          : s === 'status'
            ? (o === 'ASC'
              ? await db.$queryRaw`SELECT "id","email","name","passwordHash","status","emailVerifiedAt","createdAt","updatedAt" FROM "User" WHERE "deletedAt" IS NULL AND (${q}::text IS NULL OR "email" ILIKE ${q ? `%${q}%` : null} OR "name" ILIKE ${q ? `%${q}%` : null}) ORDER BY "status" ASC OFFSET ${offset(query)} LIMIT ${limit(query)}`
              : await db.$queryRaw`SELECT "id","email","name","passwordHash","status","emailVerifiedAt","createdAt","updatedAt" FROM "User" WHERE "deletedAt" IS NULL AND (${q}::text IS NULL OR "email" ILIKE ${q ? `%${q}%` : null} OR "name" ILIKE ${q ? `%${q}%` : null}) ORDER BY "status" DESC OFFSET ${offset(query)} LIMIT ${limit(query)}`)
            : (o === 'ASC'
              ? await db.$queryRaw`SELECT "id","email","name","passwordHash","status","emailVerifiedAt","createdAt","updatedAt" FROM "User" WHERE "deletedAt" IS NULL AND (${q}::text IS NULL OR "email" ILIKE ${q ? `%${q}%` : null} OR "name" ILIKE ${q ? `%${q}%` : null}) ORDER BY "createdAt" ASC OFFSET ${offset(query)} LIMIT ${limit(query)}`
              : await db.$queryRaw`SELECT "id","email","name","passwordHash","status","emailVerifiedAt","createdAt","updatedAt" FROM "User" WHERE "deletedAt" IS NULL AND (${q}::text IS NULL OR "email" ILIKE ${q ? `%${q}%` : null} OR "name" ILIKE ${q ? `%${q}%` : null}) ORDER BY "createdAt" DESC OFFSET ${offset(query)} LIMIT ${limit(query)}`);
      const countRows = await db.$queryRaw`SELECT COUNT(*)::int AS "count" FROM "User" WHERE "deletedAt" IS NULL AND (${q}::text IS NULL OR "email" ILIKE ${q ? `%${q}%` : null} OR "name" ILIKE ${q ? `%${q}%` : null})`;
      return { items: (rows as Record<string, unknown>[]).map(normalizeUser), total: Number((countRows as Record<string, unknown>[])[0]?.count ?? 0), page: query.page, pageSize: query.pageSize };
    },
    async create(input: { id: string; email: string; name: string; passwordHash: string; status: UserRecord['status']; createdAt: string; updatedAt: string }): Promise<UserRecord> {
      const rows = await db.$queryRaw`INSERT INTO "User" ("id","email","name","passwordHash","status","createdAt","updatedAt") VALUES (${input.id},${input.email},${input.name},${input.passwordHash},${input.status}::"UserStatus",${input.createdAt},${input.updatedAt}) RETURNING "id","email","name","passwordHash","status","emailVerifiedAt","createdAt","updatedAt"`;
      return normalizeUser((rows as Record<string, unknown>[])[0]);
    },
  };

  const organizations = {
    async findBySlug(slug: string): Promise<OrganizationRecord | null> {
      const rows = await db.$queryRaw`SELECT "id","name","slug","createdAt","updatedAt","deletedAt" FROM "Organization" WHERE "slug" = ${slug} AND "deletedAt" IS NULL LIMIT 1`;
      const row = (rows as Record<string, unknown>[])[0];
      return row ? normalizeOrganization(row) : null;
    },
    async get(id: string): Promise<OrganizationRecord | null> {
      const rows = await db.$queryRaw`SELECT "id","name","slug","createdAt","updatedAt","deletedAt" FROM "Organization" WHERE "id" = ${id} AND "deletedAt" IS NULL LIMIT 1`;
      const row = (rows as Record<string, unknown>[])[0];
      return row ? normalizeOrganization(row) : null;
    },
    async list(query: PaginationQuery, search?: string): Promise<ListResult<OrganizationRecord>> {
      const q = search?.trim() || null;
      const s = orgSort(query);
      const o = order(query);
      const rows = s === 'name'
        ? (o === 'ASC' ? await db.$queryRaw`SELECT "id","name","slug","createdAt","updatedAt","deletedAt" FROM "Organization" WHERE "deletedAt" IS NULL AND (${q}::text IS NULL OR "name" ILIKE ${q ? `%${q}%` : null}) ORDER BY "name" ASC OFFSET ${offset(query)} LIMIT ${limit(query)}` : await db.$queryRaw`SELECT "id","name","slug","createdAt","updatedAt","deletedAt" FROM "Organization" WHERE "deletedAt" IS NULL AND (${q}::text IS NULL OR "name" ILIKE ${q ? `%${q}%` : null}) ORDER BY "name" DESC OFFSET ${offset(query)} LIMIT ${limit(query)}`)
        : s === 'slug'
          ? (o === 'ASC' ? await db.$queryRaw`SELECT "id","name","slug","createdAt","updatedAt","deletedAt" FROM "Organization" WHERE "deletedAt" IS NULL AND (${q}::text IS NULL OR "name" ILIKE ${q ? `%${q}%` : null}) ORDER BY "slug" ASC OFFSET ${offset(query)} LIMIT ${limit(query)}` : await db.$queryRaw`SELECT "id","name","slug","createdAt","updatedAt","deletedAt" FROM "Organization" WHERE "deletedAt" IS NULL AND (${q}::text IS NULL OR "name" ILIKE ${q ? `%${q}%` : null}) ORDER BY "slug" DESC OFFSET ${offset(query)} LIMIT ${limit(query)}`)
          : (o === 'ASC' ? await db.$queryRaw`SELECT "id","name","slug","createdAt","updatedAt","deletedAt" FROM "Organization" WHERE "deletedAt" IS NULL AND (${q}::text IS NULL OR "name" ILIKE ${q ? `%${q}%` : null}) ORDER BY "createdAt" ASC OFFSET ${offset(query)} LIMIT ${limit(query)}` : await db.$queryRaw`SELECT "id","name","slug","createdAt","updatedAt","deletedAt" FROM "Organization" WHERE "deletedAt" IS NULL AND (${q}::text IS NULL OR "name" ILIKE ${q ? `%${q}%` : null}) ORDER BY "createdAt" DESC OFFSET ${offset(query)} LIMIT ${limit(query)}`);
      const countRows = await db.$queryRaw`SELECT COUNT(*)::int AS "count" FROM "Organization" WHERE "deletedAt" IS NULL AND (${q}::text IS NULL OR "name" ILIKE ${q ? `%${q}%` : null})`;
      return { items: (rows as Record<string, unknown>[]).map(normalizeOrganization), total: Number((countRows as Record<string, unknown>[])[0]?.count ?? 0), page: query.page, pageSize: query.pageSize };
    },
    async create(input: { id: string; name: string; slug: string; createdAt: string; updatedAt: string }): Promise<OrganizationRecord> {
      const rows = await db.$queryRaw`INSERT INTO "Organization" ("id","name","slug","createdAt","updatedAt") VALUES (${input.id},${input.name},${input.slug},${input.createdAt},${input.updatedAt}) RETURNING "id","name","slug","createdAt","updatedAt","deletedAt"`;
      return normalizeOrganization((rows as Record<string, unknown>[])[0]);
    },
    async softDelete(id: string): Promise<void> {
      const rows = await db.$queryRaw`UPDATE "Organization" SET "deletedAt" = NOW(), "updatedAt" = NOW() WHERE "id" = ${id} AND "deletedAt" IS NULL RETURNING "id"`;
      if (!Array.isArray(rows) || rows.length === 0) throw new Error('Organization not found');
    },
  };

  const projects = {
    async get(id: string): Promise<ProjectRecord | null> {
      const rows = await db.$queryRaw`SELECT "id","organizationId","name","slug","description","createdAt","updatedAt","deletedAt" FROM "Project" WHERE "id" = ${id} AND "deletedAt" IS NULL LIMIT 1`;
      const row = (rows as Record<string, unknown>[])[0];
      return row ? normalizeProject(row) : null;
    },
    async list(query: PaginationQuery): Promise<ListResult<ProjectRecord>> {
      const s = projectSort(query);
      const o = order(query);
      const rows = s === 'name'
        ? (o === 'ASC' ? await db.$queryRaw`SELECT "id","organizationId","name","slug","description","createdAt","updatedAt","deletedAt" FROM "Project" WHERE "deletedAt" IS NULL ORDER BY "name" ASC OFFSET ${offset(query)} LIMIT ${limit(query)}` : await db.$queryRaw`SELECT "id","organizationId","name","slug","description","createdAt","updatedAt","deletedAt" FROM "Project" WHERE "deletedAt" IS NULL ORDER BY "name" DESC OFFSET ${offset(query)} LIMIT ${limit(query)}`)
        : s === 'slug'
          ? (o === 'ASC' ? await db.$queryRaw`SELECT "id","organizationId","name","slug","description","createdAt","updatedAt","deletedAt" FROM "Project" WHERE "deletedAt" IS NULL ORDER BY "slug" ASC OFFSET ${offset(query)} LIMIT ${limit(query)}` : await db.$queryRaw`SELECT "id","organizationId","name","slug","description","createdAt","updatedAt","deletedAt" FROM "Project" WHERE "deletedAt" IS NULL ORDER BY "slug" DESC OFFSET ${offset(query)} LIMIT ${limit(query)}`)
          : (o === 'ASC' ? await db.$queryRaw`SELECT "id","organizationId","name","slug","description","createdAt","updatedAt","deletedAt" FROM "Project" WHERE "deletedAt" IS NULL ORDER BY "createdAt" ASC OFFSET ${offset(query)} LIMIT ${limit(query)}` : await db.$queryRaw`SELECT "id","organizationId","name","slug","description","createdAt","updatedAt","deletedAt" FROM "Project" WHERE "deletedAt" IS NULL ORDER BY "createdAt" DESC OFFSET ${offset(query)} LIMIT ${limit(query)}`);
      const countRows = await db.$queryRaw`SELECT COUNT(*)::int AS "count" FROM "Project" WHERE "deletedAt" IS NULL`;
      return { items: (rows as Record<string, unknown>[]).map(normalizeProject), total: Number((countRows as Record<string, unknown>[])[0]?.count ?? 0), page: query.page, pageSize: query.pageSize };
    },
    async create(input: { id: string; organizationId: string; name: string; slug: string; description?: string; createdAt: string; updatedAt: string }): Promise<ProjectRecord> {
      const rows = await db.$queryRaw`INSERT INTO "Project" ("id","organizationId","name","slug","description","createdAt","updatedAt") VALUES (${input.id},${input.organizationId},${input.name},${input.slug},${input.description ?? null},${input.createdAt},${input.updatedAt}) RETURNING "id","organizationId","name","slug","description","createdAt","updatedAt","deletedAt"`;
      return normalizeProject((rows as Record<string, unknown>[])[0]);
    },
  };

  const workspaces = {
    async get(id: string): Promise<WorkspaceRecord | null> {
      const rows = await db.$queryRaw`SELECT "id","organizationId","projectId","name","slug","environment","createdAt","updatedAt","deletedAt" FROM "Workspace" WHERE "id" = ${id} AND "deletedAt" IS NULL LIMIT 1`;
      const row = (rows as Record<string, unknown>[])[0];
      return row ? normalizeWorkspace(row) : null;
    },
    async list(query: PaginationQuery): Promise<ListResult<WorkspaceRecord>> {
      const s = workspaceSort(query);
      const o = order(query);
      const rows = s === 'name'
        ? (o === 'ASC' ? await db.$queryRaw`SELECT "id","organizationId","projectId","name","slug","environment","createdAt","updatedAt","deletedAt" FROM "Workspace" WHERE "deletedAt" IS NULL ORDER BY "name" ASC OFFSET ${offset(query)} LIMIT ${limit(query)}` : await db.$queryRaw`SELECT "id","organizationId","projectId","name","slug","environment","createdAt","updatedAt","deletedAt" FROM "Workspace" WHERE "deletedAt" IS NULL ORDER BY "name" DESC OFFSET ${offset(query)} LIMIT ${limit(query)}`)
        : s === 'slug'
          ? (o === 'ASC' ? await db.$queryRaw`SELECT "id","organizationId","projectId","name","slug","environment","createdAt","updatedAt","deletedAt" FROM "Workspace" WHERE "deletedAt" IS NULL ORDER BY "slug" ASC OFFSET ${offset(query)} LIMIT ${limit(query)}` : await db.$queryRaw`SELECT "id","organizationId","projectId","name","slug","environment","createdAt","updatedAt","deletedAt" FROM "Workspace" WHERE "deletedAt" IS NULL ORDER BY "slug" DESC OFFSET ${offset(query)} LIMIT ${limit(query)}`)
          : s === 'environment'
            ? (o === 'ASC' ? await db.$queryRaw`SELECT "id","organizationId","projectId","name","slug","environment","createdAt","updatedAt","deletedAt" FROM "Workspace" WHERE "deletedAt" IS NULL ORDER BY "environment" ASC OFFSET ${offset(query)} LIMIT ${limit(query)}` : await db.$queryRaw`SELECT "id","organizationId","projectId","name","slug","environment","createdAt","updatedAt","deletedAt" FROM "Workspace" WHERE "deletedAt" IS NULL ORDER BY "environment" DESC OFFSET ${offset(query)} LIMIT ${limit(query)}`)
            : (o === 'ASC' ? await db.$queryRaw`SELECT "id","organizationId","projectId","name","slug","environment","createdAt","updatedAt","deletedAt" FROM "Workspace" WHERE "deletedAt" IS NULL ORDER BY "createdAt" ASC OFFSET ${offset(query)} LIMIT ${limit(query)}` : await db.$queryRaw`SELECT "id","organizationId","projectId","name","slug","environment","createdAt","updatedAt","deletedAt" FROM "Workspace" WHERE "deletedAt" IS NULL ORDER BY "createdAt" DESC OFFSET ${offset(query)} LIMIT ${limit(query)}`);
      const countRows = await db.$queryRaw`SELECT COUNT(*)::int AS "count" FROM "Workspace" WHERE "deletedAt" IS NULL`;
      return { items: (rows as Record<string, unknown>[]).map(normalizeWorkspace), total: Number((countRows as Record<string, unknown>[])[0]?.count ?? 0), page: query.page, pageSize: query.pageSize };
    },
    async create(input: { id: string; organizationId: string; projectId?: string; name: string; slug: string; environment: string; createdAt: string; updatedAt: string }): Promise<WorkspaceRecord> {
      const rows = await db.$queryRaw`INSERT INTO "Workspace" ("id","organizationId","projectId","name","slug","environment","createdAt","updatedAt") VALUES (${input.id},${input.organizationId},${input.projectId ?? null},${input.name},${input.slug},${input.environment},${input.createdAt},${input.updatedAt}) RETURNING "id","organizationId","projectId","name","slug","environment","createdAt","updatedAt","deletedAt"`;
      return normalizeWorkspace((rows as Record<string, unknown>[])[0]);
    },
  };

  const sessions = {
    async create(input: { id: string; userId: string; refreshToken: string; expiresAt: string }): Promise<SessionRecord> {
      const rows = await db.$queryRaw`INSERT INTO "Session" ("id","userId","refreshTokenHash","expiresAt") VALUES (${input.id},${input.userId},${hashToken(input.refreshToken)},${input.expiresAt}) RETURNING "id","userId","refreshTokenHash","expiresAt","revokedAt"`;
      return normalizeSession((rows as Record<string, unknown>[])[0]);
    },
    async get(id: string): Promise<SessionRecord | null> {
      const rows = await db.$queryRaw`SELECT "id","userId","refreshTokenHash","expiresAt","revokedAt" FROM "Session" WHERE "id" = ${id} LIMIT 1`;
      const row = (rows as Record<string, unknown>[])[0];
      return row ? normalizeSession(row) : null;
    },
    async matchesRefreshToken(session: SessionRecord, token: string): Promise<boolean> {
      return session.refreshTokenHash === hashToken(token);
    },
    async revoke(id: string): Promise<void> {
      await db.$queryRaw`UPDATE "Session" SET "revokedAt" = NOW() WHERE "id" = ${id} AND "revokedAt" IS NULL`;
    },
  };

  return { users, organizations, projects, workspaces, sessions };
};

export type DurableRepositories = ReturnType<typeof createDurableRepositories>;
