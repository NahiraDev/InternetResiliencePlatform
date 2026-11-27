import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { z } from 'zod';
import type { Principal } from '@irp/auth';
import {
  ConflictAppError,
  ForbiddenAppError,
  NotFoundAppError,
  ValidationAppError,
} from '@irp/core';
import {
  DuplicateError,
  MEMBER_ROLES,
  MissingParentError,
  StaleWriteError,
  type IdentityRepositories,
  type OrganizationRole,
  type PageQuery,
  type TenantScope,
} from '../identity/types.js';

/**
 * Organization, project, workspace and membership routes.
 *
 * Access inside an organization comes from ownership (`Organization.ownerUserId`) or an active
 * `Membership`; platform admins have full access. Creating an organization still requires the
 * `organizations:write` permission. Projects and workspaces have no membership of their own: access is
 * inherited from the parent organization.
 *
 * A resource the caller cannot see is reported as 404; a visible resource with too low a role as 403.
 */

const RANK: Record<OrganizationRole, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export interface TenancyRouteDeps {
  repos: IdentityRepositories;
  preHandler: preHandlerAsyncHookHandler;
  readPreHandler: preHandlerAsyncHookHandler;
  requireAuth(request: FastifyRequest): Promise<Principal>;
  requirePermission(request: FastifyRequest, permission: string): Promise<Principal>;
}

const idParams = z.object({ id: z.string().uuid() });
const memberParams = z.object({ id: z.string().uuid(), userId: z.string().uuid() });
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().max(200).optional(),
});

const name = z.string().trim().min(1).max(120);
const slug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase letters, digits and single hyphens');
const description = z.string().max(1000);
const environment = z.enum(['development', 'staging', 'production']);
// Creation keeps accepting what it accepted before (any 1-80 character slug, unknown keys ignored).
const createSchema = z.object({
  name,
  slug: z.string().min(1).max(80).optional(),
  description: description.optional(),
});
const createWorkspaceSchema = createSchema.extend({
  projectId: z.string().uuid().optional(),
  environment: environment.default('production'),
});
// Updates are strict: attempts to change parents or other fields (organizationId, ...) are rejected.
const expectedUpdatedAt = z.string().datetime().optional();
const patchOf = <S extends z.ZodRawShape>(shape: S) =>
  z
    .strictObject({ ...shape, expectedUpdatedAt })
    .refine(
      (body) => Object.entries(body).some(([k, v]) => k !== 'expectedUpdatedAt' && v !== undefined),
      'at least one field to update is required',
    );
const organizationPatch = patchOf({ name: name.optional(), slug: slug.optional() });
const projectPatch = patchOf({
  name: name.optional(),
  slug: slug.optional(),
  description: description.nullable().optional(),
});
const workspacePatch = patchOf({
  name: name.optional(),
  slug: slug.optional(),
  environment: environment.optional(),
  projectId: z.string().uuid().optional(),
});
const role = z.enum(MEMBER_ROLES);
const addMember = z
  .strictObject({
    email: z.string().email().toLowerCase().optional(),
    userId: z.string().uuid().optional(),
    role: role.default('member'),
  })
  .refine((b) => !!b.email !== !!b.userId, 'provide exactly one of email or userId');
const memberPatch = z
  .strictObject({ role: role.optional(), status: z.enum(['active', 'suspended']).optional() })
  .refine((b) => b.role !== undefined || b.status !== undefined, 'role or status is required');

const slugFor = (given: string | undefined, from: string): string => {
  if (given) return given;
  const derived = from
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 80)
    .replace(/(^-|-$)/g, '');
  // Names without Latin letters or digits (for example Persian) would otherwise all derive "".
  return derived || `item-${crypto.randomUUID().slice(0, 8)}`;
};

const ok = <T>(data: T, meta?: unknown) => ({ success: true, data, ...(meta ? { meta } : {}) });
const paged = <T>(r: { items: T[]; total: number; page: number; pageSize: number }) =>
  ok(r.items, { total: r.total, page: r.page, pageSize: r.pageSize });

const translate = async <T>(operation: () => Promise<T>, duplicate: string): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DuplicateError) throw new ConflictAppError(duplicate);
    if (error instanceof StaleWriteError)
      throw new ConflictAppError('The resource was modified by another request. Reload and retry.');
    if (error instanceof MissingParentError) throw new NotFoundAppError(error.parent);
    throw error;
  }
};
const found = <T>(value: T | null, resource: string): T => {
  if (!value) throw new NotFoundAppError(resource);
  return value;
};

export const registerTenancyRoutes = (app: FastifyInstance, deps: TenancyRouteDeps): void => {
  const { repos } = deps;
  const now = () => new Date().toISOString();
  const isPlatformAdmin = (p: Principal) => p.roles.includes('platform_admin');
  const scopeOf = (p: Principal): TenantScope =>
    isPlatformAdmin(p) ? { kind: 'all' } : { kind: 'user', userId: p.id };

  /** Requires at least `minimum` in a live organization. */
  const authorize = async (p: Principal, organizationId: string, minimum: OrganizationRole) => {
    if (isPlatformAdmin(p)) {
      found(await repos.organizations.findById(organizationId, { kind: 'all' }), 'organization');
      return 'owner' as const;
    }
    const actual = await repos.organizations.roleOf(organizationId, p.id);
    if (!actual) throw new NotFoundAppError('organization');
    if (RANK[actual] < RANK[minimum]) throw new ForbiddenAppError();
    return actual;
  };
  const organizationFor = async (request: FastifyRequest, minimum: OrganizationRole) => {
    const principal = await deps.requireAuth(request);
    const { id } = idParams.parse(request.params);
    await authorize(principal, id, minimum);
    return { principal, id };
  };
  const projectFor = async (request: FastifyRequest, minimum: OrganizationRole) => {
    const principal = await deps.requireAuth(request);
    const { id } = idParams.parse(request.params);
    const project = found(await repos.projects.findById(id, scopeOf(principal)), 'project');
    await authorize(principal, project.organizationId, minimum);
    return { principal, project };
  };
  const workspaceFor = async (request: FastifyRequest, minimum: OrganizationRole) => {
    const principal = await deps.requireAuth(request);
    const { id } = idParams.parse(request.params);
    const workspace = found(await repos.workspaces.findById(id, scopeOf(principal)), 'workspace');
    await authorize(principal, workspace.organizationId, minimum);
    return { principal, workspace };
  };
  // Collection lists keep denying (403) a user who neither holds the read permission nor belongs to any
  // organization; results are always limited to the caller's own organizations.
  const listFor = async (
    request: FastifyRequest,
    permission: string,
  ): Promise<{ q: PageQuery; scope: TenantScope }> => {
    const principal = await deps.requireAuth(request);
    const scope = scopeOf(principal);
    if (!isPlatformAdmin(principal) && !principal.scopes.includes(permission)) {
      const mine = await repos.organizations.list(
        { page: 1, pageSize: 1, sort: 'createdAt', order: 'desc' },
        scope,
      );
      if (!mine.total) throw new ForbiddenAppError();
    }
    return { q: pageQuery.parse(request.query), scope };
  };
  const options = (tag: string, summary: string, preHandler = deps.preHandler) => ({
    preHandler,
    // Documentation only: validation stays in zod, as elsewhere in this API.
    schema: { tags: [tag], summary, security: [{ bearerAuth: [] }] },
  });

  // ── Organizations ────────────────────────────────────────────────────────
  app.get(
    '/api/v1/organizations',
    options('organizations', 'List organizations you can access'),
    async (request) => {
      const { q, scope } = await listFor(request, 'organizations:read');
      return paged(await repos.organizations.list(q, scope));
    },
  );
  app.post(
    '/api/v1/organizations',
    options('organizations', 'Create an organization (you become its owner)'),
    async (request, reply) => {
      const p = await deps.requirePermission(request, 'organizations:write');
      const input = createSchema.parse(request.body);
      const t = now();
      const organization = await translate(
        () =>
          repos.organizations.create({
            id: crypto.randomUUID(),
            name: input.name,
            slug: slugFor(input.slug, input.name),
            ownerUserId: p.id,
            createdAt: t,
            updatedAt: t,
            deletedAt: null,
          }),
        'Organization slug already exists.',
      );
      return reply.code(201).send(ok(organization));
    },
  );
  app.get(
    '/api/v1/organizations/:id',
    options('organizations', 'Get an organization'),
    async (request) => {
      const { principal, id } = await organizationFor(request, 'viewer');
      return ok(found(await repos.organizations.findById(id, scopeOf(principal)), 'organization'));
    },
  );
  app.patch(
    '/api/v1/organizations/:id',
    options('organizations', 'Update an organization (admin)'),
    async (request) => {
      const { id } = await organizationFor(request, 'admin');
      const { expectedUpdatedAt: expected, ...patch } = organizationPatch.parse(request.body);
      const updated = await translate(
        () =>
          repos.organizations.update(id, patch as { name?: string; slug?: string }, {
            at: now(),
            expectedUpdatedAt: expected,
          }),
        'Organization slug already exists.',
      );
      return ok(found(updated, 'organization'));
    },
  );
  app.delete(
    '/api/v1/organizations/:id',
    options('organizations', 'Archive an organization and its contents (owner)'),
    async (request) => {
      const { id } = await organizationFor(request, 'owner');
      if (!(await repos.organizations.archive(id, now())))
        throw new NotFoundAppError('organization');
      return ok({ deleted: true });
    },
  );
  app.post(
    '/api/v1/organizations/:id/ownership',
    options('organizations', 'Transfer ownership to an active member (owner)'),
    async (request) => {
      const { id } = await organizationFor(request, 'owner');
      const { userId } = z.strictObject({ userId: z.string().uuid() }).parse(request.body);
      const updated = await repos.organizations.transferOwnership(id, userId, now());
      if (!updated)
        throw new ValidationAppError('The new owner must be an active member of the organization.');
      return ok(updated);
    },
  );

  // ── Organization members ─────────────────────────────────────────────────
  app.get(
    '/api/v1/organizations/:id/members',
    options('members', 'List members'),
    async (request) => {
      const { id } = await organizationFor(request, 'viewer');
      return paged(await repos.memberships.list(id, pageQuery.parse(request.query)));
    },
  );
  app.post(
    '/api/v1/organizations/:id/members',
    options('members', 'Add a member (admin)'),
    async (request, reply) => {
      const { id } = await organizationFor(request, 'admin');
      const input = addMember.parse(request.body);
      const user = input.userId
        ? await repos.users.findById(input.userId)
        : await repos.users.findByEmail(input.email!);
      if (!user || user.status !== 'active') throw new NotFoundAppError('user');
      const member = await translate(
        () => repos.memberships.add(id, user.id, input.role, now()),
        'User is already a member of this organization.',
      );
      return reply.code(201).send(ok(member));
    },
  );
  app.patch(
    '/api/v1/organizations/:id/members/:userId',
    options('members', 'Change a member role or status (admin)'),
    async (request) => {
      const principal = await deps.requireAuth(request);
      const { id, userId } = memberParams.parse(request.params);
      await authorize(principal, id, 'admin');
      const patch = memberPatch.parse(request.body);
      const updated = await translate(
        () =>
          repos.memberships.update(
            id,
            userId,
            {
              ...(patch.role ? { role: patch.role } : {}),
              ...(patch.status ? { status: patch.status } : {}),
            },
            now(),
          ),
        'Membership conflict.',
      );
      return ok(found(updated, 'membership'));
    },
  );
  app.delete(
    '/api/v1/organizations/:id/members/:userId',
    options('members', 'Remove a member (admin), or leave'),
    async (request) => {
      const principal = await deps.requireAuth(request);
      const { id, userId } = memberParams.parse(request.params);
      await authorize(principal, id, principal.id === userId ? 'viewer' : 'admin');
      if (!(await repos.memberships.remove(id, userId, now())))
        throw new NotFoundAppError('membership');
      return ok({ deleted: true });
    },
  );

  // ── Projects ─────────────────────────────────────────────────────────────
  app.get(
    '/api/v1/projects',
    options('projects', 'List projects you can access'),
    async (request) => {
      const { q, scope } = await listFor(request, 'projects:read');
      return paged(await repos.projects.list(q, scope));
    },
  );
  app.get(
    '/api/v1/organizations/:id/projects',
    options('projects', 'List projects of an organization'),
    async (request) => {
      const { principal, id } = await organizationFor(request, 'viewer');
      return paged(
        await repos.projects.list(pageQuery.parse(request.query), scopeOf(principal), {
          organizationId: id,
        }),
      );
    },
  );
  app.post(
    '/api/v1/organizations/:id/projects',
    options('projects', 'Create a project (member)'),
    async (request, reply) => {
      const { id } = await organizationFor(request, 'member');
      const input = createSchema.parse(request.body);
      const t = now();
      const project = await translate(
        () =>
          repos.projects.create({
            id: crypto.randomUUID(),
            organizationId: id,
            name: input.name,
            slug: slugFor(input.slug, input.name),
            ...(input.description ? { description: input.description } : {}),
            createdAt: t,
            updatedAt: t,
            deletedAt: null,
          }),
        'Project slug already exists in this organization.',
      );
      return reply.code(201).send(ok(project));
    },
  );
  app.get('/api/v1/projects/:id', options('projects', 'Get a project'), async (request) => {
    return ok((await projectFor(request, 'viewer')).project);
  });
  app.patch(
    '/api/v1/projects/:id',
    options('projects', 'Update a project (member)'),
    async (request) => {
      const { project } = await projectFor(request, 'member');
      const { expectedUpdatedAt: expected, ...patch } = projectPatch.parse(request.body);
      const updated = await translate(
        () =>
          repos.projects.update(
            project.id,
            patch as { name?: string; slug?: string; description?: string | null },
            { at: now(), expectedUpdatedAt: expected },
          ),
        'Project slug already exists in this organization.',
      );
      return ok(found(updated, 'project'));
    },
  );
  app.delete(
    '/api/v1/projects/:id',
    options('projects', 'Archive a project and its workspaces (admin)'),
    async (request) => {
      const { project } = await projectFor(request, 'admin');
      if (!(await repos.projects.archive(project.id, now()))) throw new NotFoundAppError('project');
      return ok({ deleted: true });
    },
  );

  // ── Workspaces ───────────────────────────────────────────────────────────
  const createWorkspace = async (
    organizationId: string,
    input: z.infer<typeof createWorkspaceSchema>,
  ) => {
    const t = now();
    return translate(
      () =>
        repos.workspaces.create({
          id: crypto.randomUUID(),
          organizationId,
          ...(input.projectId ? { projectId: input.projectId } : {}),
          name: input.name,
          slug: slugFor(input.slug, input.name),
          environment: input.environment,
          createdAt: t,
          updatedAt: t,
          deletedAt: null,
        }),
      'Workspace slug already exists in this organization.',
    );
  };
  app.get(
    '/api/v1/workspaces',
    options('workspaces', 'List workspaces you can access'),
    async (request) => {
      const { q, scope } = await listFor(request, 'workspaces:read');
      return paged(await repos.workspaces.list(q, scope));
    },
  );
  app.get(
    '/api/v1/organizations/:id/workspaces',
    options('workspaces', 'List workspaces of an organization'),
    async (request) => {
      const { principal, id } = await organizationFor(request, 'viewer');
      return paged(
        await repos.workspaces.list(pageQuery.parse(request.query), scopeOf(principal), {
          organizationId: id,
        }),
      );
    },
  );
  app.get(
    '/api/v1/projects/:id/workspaces',
    options('workspaces', 'List workspaces of a project'),
    async (request) => {
      const { principal, project } = await projectFor(request, 'viewer');
      return paged(
        await repos.workspaces.list(pageQuery.parse(request.query), scopeOf(principal), {
          projectId: project.id,
        }),
      );
    },
  );
  app.post(
    '/api/v1/organizations/:id/workspaces',
    options('workspaces', 'Create a workspace in an organization (member)'),
    async (request, reply) => {
      const { id } = await organizationFor(request, 'member');
      return reply
        .code(201)
        .send(ok(await createWorkspace(id, createWorkspaceSchema.parse(request.body))));
    },
  );
  app.post(
    '/api/v1/projects/:id/workspaces',
    options('workspaces', 'Create a workspace in a project (member)'),
    async (request, reply) => {
      const { project } = await projectFor(request, 'member');
      const input = createWorkspaceSchema.parse(request.body);
      if (input.projectId && input.projectId !== project.id)
        throw new ValidationAppError('projectId does not match the project in the URL.');
      return reply
        .code(201)
        .send(
          ok(await createWorkspace(project.organizationId, { ...input, projectId: project.id })),
        );
    },
  );
  app.get(
    '/api/v1/workspaces/:id',
    options('workspaces', 'Get a workspace', deps.readPreHandler),
    async (request) => {
      return ok((await workspaceFor(request, 'viewer')).workspace);
    },
  );
  app.patch(
    '/api/v1/workspaces/:id',
    options('workspaces', 'Update a workspace (member)'),
    async (request) => {
      const { workspace } = await workspaceFor(request, 'member');
      const { expectedUpdatedAt: expected, ...patch } = workspacePatch.parse(request.body);
      const updated = await translate(
        () =>
          repos.workspaces.update(
            workspace.id,
            patch as { name?: string; slug?: string; environment?: string; projectId?: string },
            { at: now(), expectedUpdatedAt: expected },
          ),
        'Workspace slug already exists in this organization.',
      );
      return ok(found(updated, 'workspace'));
    },
  );
  app.delete(
    '/api/v1/workspaces/:id',
    options('workspaces', 'Archive a workspace (admin)'),
    async (request) => {
      const { workspace } = await workspaceFor(request, 'admin');
      if (!(await repos.workspaces.archive(workspace.id, now())))
        throw new NotFoundAppError('workspace');
      return ok({ deleted: true });
    },
  );
};
