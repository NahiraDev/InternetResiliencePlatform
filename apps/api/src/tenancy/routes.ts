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
  AccessDeniedError,
  DuplicateError,
  hasRole,
  MEMBER_ROLES,
  MissingParentError,
  QuotaExceededError,
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
 * Both denials of an existing tenant resource are written to the audit log (`tenancy.access.denied`).
 */

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
// Required on every update, so a stale client gets 409 instead of overwriting a newer change.
const expectedUpdatedAt = z.string().datetime();
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
  .strictObject({
    role: role.optional(),
    status: z.enum(['active', 'suspended']).optional(),
    expectedUpdatedAt,
  })
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
    if (error instanceof QuotaExceededError)
      throw new ConflictAppError(`${error.message}.`, {
        resource: error.resource,
        limit: error.limit,
      });
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

  type TenantResource = 'organization' | 'project' | 'workspace';
  const auditDenied = (request: FastifyRequest, p: Principal, resource: TenantResource, resourceId: string, organizationId: string, reason: 'not_a_member' | 'insufficient_role' | 'cross_tenant_parent') => repos.audit.record({ actorUserId: p.id, action: 'tenancy.access.denied', resource, resourceId, metadata: { organizationId, reason, method: request.method, route: request.routeOptions.url }, ipAddress: request.ip });

  /** Requires at least `minimum` in a live organization. */
  const authorize = async (request: FastifyRequest, p: Principal, organizationId: string, minimum: OrganizationRole, target: { resource: TenantResource; id: string } = { resource: 'organization', id: organizationId }) => {
    if (isPlatformAdmin(p)) {
      found(await repos.organizations.findById(organizationId, { kind: 'all' }), 'organization');
      return 'owner' as const;
    }
    const actual = await repos.organizations.roleOf(organizationId, p.id);
    if (!actual) {
      if (await repos.organizations.findById(organizationId, { kind: 'all' })) await auditDenied(request, p, target.resource, target.id, organizationId, 'not_a_member');
      throw new NotFoundAppError(target.resource);
    }
    if (!hasRole(actual, minimum)) {
      await auditDenied(request, p, target.resource, target.id, organizationId, 'insufficient_role');
      throw new ForbiddenAppError();
    }
    return actual;
  };
  const write = async <T>(request: FastifyRequest, p: Principal, target: { resource: TenantResource; id: string }, operation: (actor: TenantScope) => Promise<T>, duplicate = 'Resource conflict.'): Promise<T> => {
    try { return await translate(() => operation(scopeOf(p)), duplicate); }
    catch (error) { if (!(error instanceof AccessDeniedError)) throw error; await auditDenied(request, p, target.resource, target.id, error.organizationId, error.reason); if (error.reason === 'insufficient_role') throw new ForbiddenAppError(); throw new NotFoundAppError(target.resource); }
  };
  const organizationTarget = (id: string) => ({ resource: 'organization' as const, id });
  const organizationFor = async (request: FastifyRequest, minimum: OrganizationRole) => {
    const principal = await deps.requireAuth(request);
    const { id } = idParams.parse(request.params);
    await authorize(request, principal, id, minimum);
    return { principal, id };
  };
  // Unscoped lookup is only used to authorize and audit; nothing is returned before authorization.
  const projectFor = async (request: FastifyRequest, minimum: OrganizationRole) => {
    const principal = await deps.requireAuth(request);
    const { id } = idParams.parse(request.params);
    const project = found(await repos.projects.findById(id, { kind: 'all' }), 'project');
    await authorize(request, principal, project.organizationId, minimum, { resource: 'project', id });
    return { principal, project };
  };
  const workspaceFor = async (request: FastifyRequest, minimum: OrganizationRole) => {
    const principal = await deps.requireAuth(request);
    const { id } = idParams.parse(request.params);
    const workspace = found(await repos.workspaces.findById(id, { kind: 'all' }), 'workspace');
    await authorize(request, principal, workspace.organizationId, minimum, { resource: 'workspace', id });
    return { principal, workspace };
  };
  const auditForeignProject = async (request: FastifyRequest, p: Principal, organizationId: string, projectId: string | undefined) => { if (!projectId) return; const project = await repos.projects.findById(projectId, { kind: 'all' }); if (project && project.organizationId !== organizationId) await auditDenied(request, p, 'project', projectId, project.organizationId, 'cross_tenant_parent'); };
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
      const { principal, id } = await organizationFor(request, 'admin');
      const { expectedUpdatedAt: expected, ...patch } = organizationPatch.parse(request.body);
      const updated = await write(request, principal, organizationTarget(id), (actor) => repos.organizations.update(id, patch as { name?: string; slug?: string }, { at: now(), expectedUpdatedAt: expected }, actor),
        'Organization slug already exists.',
      );
      return ok(found(updated, 'organization'));
    },
  );
  app.delete(
    '/api/v1/organizations/:id',
    options('organizations', 'Archive an organization and its contents (owner)'),
    async (request) => {
      const { principal, id } = await organizationFor(request, 'owner');
      const archived = await write(request, principal, organizationTarget(id), (actor) => repos.organizations.archive(id, now(), actor));
      if (!archived) throw new NotFoundAppError('organization');
      return ok({ deleted: true });
    },
  );
  app.post(
    '/api/v1/organizations/:id/ownership',
    options('organizations', 'Transfer ownership to an active member (owner)'),
    async (request) => {
      const { principal, id } = await organizationFor(request, 'owner');
      const { userId } = z.strictObject({ userId: z.string().uuid() }).parse(request.body);
      const expectedOwner = isPlatformAdmin(principal) ? found(await repos.organizations.findById(id, { kind: 'all' }), 'organization').ownerUserId : principal.id;
      const updated = await translate(() => repos.organizations.transferOwnership(id, userId, now(), expectedOwner), 'Ownership conflict.');
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
      const { principal, id } = await organizationFor(request, 'admin');
      const input = addMember.parse(request.body);
      const user = input.userId
        ? await repos.users.findById(input.userId)
        : await repos.users.findByEmail(input.email!);
      if (!user || user.status !== 'active') throw new NotFoundAppError('user');
      const member = await write(request, principal, organizationTarget(id), (actor) => repos.memberships.add(id, user.id, input.role, now(), actor),
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
      await authorize(request, principal, id, 'admin');
      const patch = memberPatch.parse(request.body);
      const updated = await write(request, principal, organizationTarget(id), (actor) =>
          repos.memberships.update(
            id,
            userId,
            {
              ...(patch.role ? { role: patch.role } : {}),
              ...(patch.status ? { status: patch.status } : {}),
            },
            { at: now(), expectedUpdatedAt: patch.expectedUpdatedAt },
            actor,
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
      await authorize(request, principal, id, principal.id === userId ? 'viewer' : 'admin');
      const removed = await write(request, principal, organizationTarget(id), (actor) => repos.memberships.remove(id, userId, now(), actor));
      if (!removed) throw new NotFoundAppError('membership');
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
      const { principal, id } = await organizationFor(request, 'member');
      const input = createSchema.parse(request.body);
      const t = now();
      const project = await write(request, principal, organizationTarget(id), (actor) => repos.projects.create({ id: crypto.randomUUID(), organizationId: id, name: input.name, slug: slugFor(input.slug, input.name), ...(input.description ? { description: input.description } : {}), createdAt: t, updatedAt: t, deletedAt: null }, actor),
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
      const { principal, project } = await projectFor(request, 'member');
      const { expectedUpdatedAt: expected, ...patch } = projectPatch.parse(request.body);
      const updated = await write(request, principal, { resource: 'project', id: project.id }, (actor) =>
          repos.projects.update(
            project.id,
            patch as { name?: string; slug?: string; description?: string | null },
            { at: now(), expectedUpdatedAt: expected },
            actor,
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
      const { principal, project } = await projectFor(request, 'admin');
      const archived = await write(request, principal, { resource: 'project', id: project.id }, (actor) => repos.projects.archive(project.id, now(), actor));
      if (!archived) throw new NotFoundAppError('project');
      return ok({ deleted: true });
    },
  );

  // ── Workspaces ───────────────────────────────────────────────────────────
  const createWorkspace = async (
    request: FastifyRequest,
    principal: Principal,
    organizationId: string,
    input: z.infer<typeof createWorkspaceSchema>,
  ) => {
    const t = now();
    return write(request, principal, organizationTarget(organizationId), (actor) => repos.workspaces.create({ id: crypto.randomUUID(), organizationId, ...(input.projectId ? { projectId: input.projectId } : {}), name: input.name, slug: slugFor(input.slug, input.name), environment: input.environment, createdAt: t, updatedAt: t, deletedAt: null }, actor),
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
      const { principal, id } = await organizationFor(request, 'member');
      const input = createWorkspaceSchema.parse(request.body);
      await auditForeignProject(request, principal, id, input.projectId);
      return reply.code(201).send(ok(await createWorkspace(request, principal, id, input)));
    },
  );
  app.post(
    '/api/v1/projects/:id/workspaces',
    options('workspaces', 'Create a workspace in a project (member)'),
    async (request, reply) => {
      const { principal, project } = await projectFor(request, 'member');
      const input = createWorkspaceSchema.parse(request.body);
      await auditForeignProject(request, principal, project.organizationId, input.projectId);
      if (input.projectId && input.projectId !== project.id)
        throw new ValidationAppError('projectId does not match the project in the URL.');
      return reply
        .code(201)
        .send(
          ok(
            await createWorkspace(request, principal, project.organizationId, {
              ...input,
              projectId: project.id,
            }),
          ),
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
      const { principal, workspace } = await workspaceFor(request, 'member');
      const { expectedUpdatedAt: expected, ...patch } = workspacePatch.parse(request.body);
      await auditForeignProject(request, principal, workspace.organizationId, patch.projectId);
      const updated = await write(request, principal, { resource: 'workspace', id: workspace.id }, (actor) =>
          repos.workspaces.update(
            workspace.id,
            patch as { name?: string; slug?: string; environment?: string; projectId?: string },
            { at: now(), expectedUpdatedAt: expected },
            actor,
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
      const { principal, workspace } = await workspaceFor(request, 'admin');
      const archived = await write(request, principal, { resource: 'workspace', id: workspace.id }, (actor) => repos.workspaces.archive(workspace.id, now(), actor));
      if (!archived) throw new NotFoundAppError('workspace');
      return ok({ deleted: true });
    },
  );
};
