import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { hashPassword } from '@irp/auth';
import { createSqlClient } from '@irp/database';
import { buildServer } from './index.js';
import { CapturingEmailSender } from './identity/mailer.js';
import { createMemoryIdentityRepositories } from './identity/memory.js';
import { createPostgresIdentityRepositories } from './identity/postgres.js';
import {
  AccessDeniedError,
  MissingParentError,
  StaleWriteError,
  tenantQuotasFromEnv,
  type IdentityRepositories,
  type TenantQuotas,
} from './identity/types.js';

/**
 * Organization / project / workspace behaviour. The same suite runs against the development-memory
 * repositories and a real PostgreSQL (IRP_TEST_DATABASE_URL, a role that may CREATE DATABASE; required
 * in CI). Restart, multi-instance and database-integrity cases run on PostgreSQL only.
 */
const adminUrl = process.env.IRP_TEST_DATABASE_URL;
if (!adminUrl && process.env.CI)
  throw new Error('IRP_TEST_DATABASE_URL is required in CI for the PostgreSQL integration tests.');

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/database/prisma/migrations',
);
const PW = 'Production12345';
const dbName = `irp_tenancy_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
const databaseUrl = () => {
  const u = new URL(adminUrl!);
  u.pathname = `/${dbName}`;
  return u.toString();
};
const admin = async (statement: string) => {
  const c = new pg.Client({ connectionString: adminUrl });
  await c.connect();
  await c.query(statement);
  await c.end();
};

interface Instance {
  app: FastifyInstance;
  repos: IdentityRepositories;
  close(): Promise<void>;
}
interface Actor {
  id: string;
  email: string;
  headers: { authorization: string };
}

let ip = 0;
const call = async (
  i: Instance,
  who: Actor | null,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) => {
  ip += 1;
  const response = await i.app.inject({
    method,
    url,
    ...(payload ? { payload } : {}),
    ...(who ? { headers: who.headers } : {}),
    // A distinct client address per request keeps the shared rate limiter out of these tests.
    remoteAddress: `10.${(ip >> 16) & 255}.${(ip >> 8) & 255}.${ip & 255}`,
  });
  return { status: response.statusCode, body: response.json(), data: response.json().data };
};

const userIn = async (
  i: Instance,
  permissions: string[] = [],
  roles = ['member'],
): Promise<Actor> => {
  const id = randomUUID();
  const email = `u-${id.slice(0, 8)}@example.com`;
  const t = new Date().toISOString();
  await i.repos.users.create({
    id,
    email,
    name: `User ${id.slice(0, 8)}`,
    passwordHash: hashPassword(PW),
    status: 'active',
    roles,
    permissions,
    emailVerifiedAt: t,
    lastLoginAt: null,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
  });
  const login = await call(i, null, 'POST', '/api/v1/auth/login', { email, password: PW });
  expect(login.status).toBe(200);
  return { id, email, headers: { authorization: `Bearer ${login.data.accessToken}` } };
};
const creator = (i: Instance) => userIn(i, ['organizations:write']);
const unique = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

/** An organization with a project and a workspace, owned by a fresh user. */
const tree = async (i: Instance) => {
  const owner = await creator(i);
  const org = (await call(i, owner, 'POST', '/api/v1/organizations', { name: unique('Org') })).data;
  const project = (
    await call(i, owner, 'POST', `/api/v1/organizations/${org.id}/projects`, { name: 'Alpha' })
  ).data;
  const workspace = (
    await call(i, owner, 'POST', `/api/v1/projects/${project.id}/workspaces`, { name: 'Primary' })
  ).data;
  return { owner, org, project, workspace };
};
const addMember = async (
  i: Instance,
  owner: Actor,
  orgId: string,
  role: 'admin' | 'member' | 'viewer',
) => {
  const user = await userIn(i);
  expect(
    (
      await call(i, owner, 'POST', `/api/v1/organizations/${orgId}/members`, {
        email: user.email,
        role,
      })
    ).status,
  ).toBe(201);
  return user;
};

/** PATCH holding the record's current version, as a client that just loaded it would be. */
const patch = async (i: Instance, who: Actor, url: string, body: object) => {
  const member = /^(.*\/members)\/([^/]+)$/.exec(url);
  const current = member
    ? (await call(i, who, 'GET', `${member[1]}?pageSize=100`)).data?.find(
        (m: { userId: string }) => m.userId === member[2],
      )
    : (await call(i, who, 'GET', url)).data;
  // A caller who cannot read the record still sends a well-formed version, to reach authorization.
  return call(i, who, 'PATCH', url, {
    expectedUpdatedAt: current?.updatedAt ?? new Date(0).toISOString(),
    ...body,
  });
};

const denials = async (i: Instance, who: Actor) =>
  (await i.repos.audit.list({ action: 'tenancy.access.denied', limit: 500 })).filter(
    (e) => e.actorUserId === who.id,
  );

const behaviour = (start: () => Promise<Instance>) => {
  let i: Instance;
  beforeAll(async () => {
    i = await start();
  }, 60_000);
  afterAll(async () => {
    await i?.close();
  });

  it('creates, reads, lists, updates and archives organizations', async () => {
    const owner = await creator(i);
    const created = await call(i, owner, 'POST', '/api/v1/organizations', {
      name: 'Acme Net',
      slug: unique('acme'),
    });
    expect(created.status).toBe(201);
    expect(created.data.ownerUserId).toBe(owner.id);
    const url = `/api/v1/organizations/${created.data.id}`;
    expect((await call(i, owner, 'GET', url)).data.name).toBe('Acme Net');
    expect(
      (await call(i, owner, 'GET', '/api/v1/organizations')).data.map((o: { id: string }) => o.id),
    ).toEqual([created.data.id]);
    const updated = await patch(i, owner, url, { name: 'Acme Networks' });
    expect(updated.status).toBe(200);
    expect(updated.data).toMatchObject({ name: 'Acme Networks', slug: created.data.slug });
    expect(Date.parse(updated.data.updatedAt)).toBeGreaterThan(Date.parse(created.data.updatedAt));
    expect((await call(i, owner, 'DELETE', url)).status).toBe(200);
    expect((await call(i, owner, 'GET', url)).status).toBe(404);
    expect((await call(i, owner, 'DELETE', url)).status).toBe(404);
    // Archived slugs stay reserved.
    expect(
      (
        await call(i, owner, 'POST', '/api/v1/organizations', {
          name: 'Again',
          slug: created.data.slug,
        })
      ).status,
    ).toBe(409);
  });

  it('creates, reads, lists, updates and archives projects and workspaces inside their parents', async () => {
    const { owner, org, project, workspace } = await tree(i);
    expect(project.organizationId).toBe(org.id);
    expect(workspace).toMatchObject({
      organizationId: org.id,
      projectId: project.id,
      environment: 'production',
    });

    const projects = await call(i, owner, 'GET', `/api/v1/organizations/${org.id}/projects`);
    expect(projects.data.map((p: { id: string }) => p.id)).toEqual([project.id]);
    expect(projects.body.meta).toEqual({ total: 1, page: 1, pageSize: 25 });
    for (const url of [
      `/api/v1/projects/${project.id}/workspaces`,
      `/api/v1/organizations/${org.id}/workspaces`,
      '/api/v1/workspaces',
    ])
      expect((await call(i, owner, 'GET', url)).data.map((w: { id: string }) => w.id)).toEqual([
        workspace.id,
      ]);

    const p = await patch(i, owner, `/api/v1/projects/${project.id}`, {
      name: 'Beta',
      description: 'edge routing',
    });
    expect(p.data).toMatchObject({
      name: 'Beta',
      description: 'edge routing',
      organizationId: org.id,
    });
    expect(
      (await patch(i, owner, `/api/v1/projects/${project.id}`, { description: null })).data
        .description,
    ).toBeUndefined();
    const w = await patch(i, owner, `/api/v1/workspaces/${workspace.id}`, {
      environment: 'staging',
      name: 'Edge',
    });
    expect(w.data).toMatchObject({ environment: 'staging', name: 'Edge', projectId: project.id });

    expect((await call(i, owner, 'DELETE', `/api/v1/workspaces/${workspace.id}`)).status).toBe(200);
    expect((await call(i, owner, 'GET', `/api/v1/workspaces/${workspace.id}`)).status).toBe(404);
    const second = (
      await call(i, owner, 'POST', `/api/v1/projects/${project.id}/workspaces`, { name: 'Second' })
    ).data;
    // Archiving a project archives its workspaces.
    expect((await call(i, owner, 'DELETE', `/api/v1/projects/${project.id}`)).status).toBe(200);
    expect((await call(i, owner, 'GET', `/api/v1/projects/${project.id}`)).status).toBe(404);
    expect((await call(i, owner, 'GET', `/api/v1/workspaces/${second.id}`)).status).toBe(404);
    expect((await call(i, owner, 'GET', `/api/v1/organizations/${org.id}`)).status).toBe(200);
  });

  it('archives everything inside an archived organization, also for platform admins', async () => {
    const { owner, org, project, workspace } = await tree(i);
    const root = await userIn(i, [], ['platform_admin']);
    expect((await call(i, root, 'GET', `/api/v1/projects/${project.id}`)).status).toBe(200);
    expect((await call(i, owner, 'DELETE', `/api/v1/organizations/${org.id}`)).status).toBe(200);
    for (const url of [
      `/api/v1/organizations/${org.id}`,
      `/api/v1/projects/${project.id}`,
      `/api/v1/workspaces/${workspace.id}`,
    ])
      expect((await call(i, root, 'GET', url)).status).toBe(404);
    expect(
      (await call(i, root, 'POST', `/api/v1/organizations/${org.id}/projects`, { name: 'Late' }))
        .status,
    ).toBe(404);
  });

  it('rejects invalid parent relationships and never detaches children', async () => {
    const a = await tree(i);
    const b = await tree(i);
    // Foreign project as a parent, on create and on update, for someone who can see both.
    const root = await userIn(i, [], ['platform_admin']);
    for (const who of [a.owner, root]) {
      expect(
        (
          await call(i, who, 'POST', `/api/v1/organizations/${a.org.id}/workspaces`, {
            name: unique('x'),
            projectId: b.project.id,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await patch(i, who, `/api/v1/workspaces/${a.workspace.id}`, {
            projectId: b.project.id,
          })
        ).status,
      ).toBe(404);
    }
    expect(
      (
        await call(i, a.owner, 'POST', `/api/v1/projects/${a.project.id}/workspaces`, {
          name: 'x',
          projectId: b.project.id,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await patch(i, a.owner, `/api/v1/projects/${a.project.id}`, {
          organizationId: b.org.id,
          name: 'moved',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await patch(i, a.owner, `/api/v1/workspaces/${a.workspace.id}`, {
          organizationId: b.org.id,
          name: 'moved',
        })
      ).status,
    ).toBe(400);
    expect(
      (await patch(i, a.owner, `/api/v1/workspaces/${a.workspace.id}`, { projectId: null }))
        .status,
    ).toBe(400);
    expect((await patch(i, a.owner, `/api/v1/projects/${a.project.id}`, {})).status).toBe(
      400,
    );
    expect(
      (await call(i, a.owner, 'GET', `/api/v1/organizations/${randomUUID()}/projects`)).status,
    ).toBe(404);
    expect(
      (await call(i, a.owner, 'GET', `/api/v1/projects/${randomUUID()}/workspaces`)).status,
    ).toBe(404);
    // Moving between projects of the same organization is allowed.
    const other = (
      await call(i, a.owner, 'POST', `/api/v1/organizations/${a.org.id}/projects`, {
        name: 'Other',
      })
    ).data;
    expect(
      (
        await patch(i, a.owner, `/api/v1/workspaces/${a.workspace.id}`, {
          projectId: other.id,
        })
      ).data.projectId,
    ).toBe(other.id);
    expect(
      (await call(i, a.owner, 'GET', `/api/v1/workspaces/${a.workspace.id}`)).data.organizationId,
    ).toBe(a.org.id);
  });

  it('enforces membership roles from the existing Membership and Role model', async () => {
    const { owner, org, project, workspace } = await tree(i);
    const base = `/api/v1/organizations/${org.id}`;
    const viewer = await addMember(i, owner, org.id, 'viewer');
    const member = await addMember(i, owner, org.id, 'member');
    const manager = await addMember(i, owner, org.id, 'admin');
    const stranger = await userIn(i);

    for (const url of [
      base,
      `/api/v1/projects/${project.id}`,
      `/api/v1/workspaces/${workspace.id}`,
      `${base}/members`,
    ])
      expect((await call(i, stranger, 'GET', url)).status).toBe(404);
    expect((await call(i, stranger, 'GET', '/api/v1/organizations')).status).toBe(403);
    expect(
      (await call(i, viewer, 'GET', '/api/v1/organizations')).data.map((o: { id: string }) => o.id),
    ).toEqual([org.id]);
    expect((await call(i, viewer, 'GET', `/api/v1/workspaces/${workspace.id}`)).status).toBe(200);
    expect((await call(i, viewer, 'POST', `${base}/projects`, { name: 'no' })).status).toBe(403);
    expect(
      (await patch(i, viewer, `/api/v1/workspaces/${workspace.id}`, { name: 'no' })).status,
    ).toBe(403);
    // Membership does not grant the right to create organizations.
    expect((await call(i, member, 'POST', '/api/v1/organizations', { name: 'no' })).status).toBe(
      403,
    );

    expect((await call(i, member, 'POST', `${base}/projects`, { name: 'By member' })).status).toBe(
      201,
    );
    expect(
      (await patch(i, member, `/api/v1/projects/${project.id}`, { name: 'Edited' })).status,
    ).toBe(200);
    expect((await call(i, member, 'DELETE', `/api/v1/projects/${project.id}`)).status).toBe(403);
    expect((await patch(i, member, base, { name: 'no' })).status).toBe(403);
    expect(
      (await call(i, member, 'POST', `${base}/members`, { email: stranger.email })).status,
    ).toBe(403);
    expect((await call(i, member, 'DELETE', `${base}/members/${viewer.id}`)).status).toBe(403);

    expect((await patch(i, manager, base, { name: unique('Renamed') })).status).toBe(200);
    expect((await call(i, manager, 'DELETE', base)).status).toBe(403);
    expect(
      (await call(i, manager, 'POST', `${base}/ownership`, { userId: manager.id })).status,
    ).toBe(403);
    // The owner is not a membership and cannot be added, changed or removed as one.
    expect((await call(i, manager, 'POST', `${base}/members`, { userId: owner.id })).status).toBe(
      409,
    );
    expect(
      (await patch(i, manager, `${base}/members/${owner.id}`, { role: 'viewer' })).status,
    ).toBe(404);
    expect((await call(i, manager, 'DELETE', `${base}/members/${owner.id}`)).status).toBe(404);

    expect((await call(i, manager, 'POST', `${base}/members`, { userId: viewer.id })).status).toBe(
      409,
    );
    expect(
      (await call(i, manager, 'POST', `${base}/members`, { email: 'nobody@example.com' })).status,
    ).toBe(404);
    expect(
      (await patch(i, manager, `${base}/members/${viewer.id}`, { role: 'member' })).data
        .role,
    ).toBe('member');
    expect((await call(i, viewer, 'POST', `${base}/projects`, { name: 'Promoted' })).status).toBe(
      201,
    );
    // Suspension and removal take effect on the next request.
    expect(
      (await patch(i, manager, `${base}/members/${viewer.id}`, { status: 'suspended' }))
        .data.status,
    ).toBe('suspended');
    expect((await call(i, viewer, 'GET', base)).status).toBe(404);
    expect((await call(i, member, 'DELETE', `${base}/members/${member.id}`)).status).toBe(200); // leave
    expect((await call(i, member, 'GET', base)).status).toBe(404);
    const list = await call(i, owner, 'GET', `${base}/members?sort=email&order=asc&pageSize=1`);
    expect(list.body.meta).toEqual({ total: 2, page: 1, pageSize: 1 });
    expect(
      (await call(i, owner, 'POST', `${base}/members`, { userId: member.id, role: 'viewer' }))
        .status,
    ).toBe(201); // re-add
  });

  it('transfers ownership to an active member', async () => {
    const { owner, org } = await tree(i);
    const base = `/api/v1/organizations/${org.id}`;
    const next = await userIn(i);
    expect((await call(i, owner, 'POST', `${base}/ownership`, { userId: next.id })).status).toBe(
      400,
    );
    await call(i, owner, 'POST', `${base}/members`, { userId: next.id });
    expect(
      (await call(i, owner, 'POST', `${base}/ownership`, { userId: next.id })).data.ownerUserId,
    ).toBe(next.id);
    expect((await call(i, owner, 'DELETE', base)).status).toBe(403); // now only an admin
    const members = (await call(i, next, 'GET', `${base}/members`)).data;
    expect(members).toEqual([
      expect.objectContaining({ userId: owner.id, role: 'admin', status: 'active' }),
    ]);
    expect((await call(i, next, 'DELETE', base)).status).toBe(200);
  });

  it('handles duplicate and concurrent writes deterministically', async () => {
    const { owner, org, project } = await tree(i);
    const attempts = <T>(fn: () => Promise<T>) => Promise.all(Array.from({ length: 6 }, fn));
    const codes = (rs: Array<{ status: number }>) => rs.map((r) => r.status).sort();
    const oneWinner = [201, 409, 409, 409, 409, 409];
    const slug = unique('dup');
    expect(
      codes(
        await attempts(() => call(i, owner, 'POST', '/api/v1/organizations', { name: 'D', slug })),
      ),
    ).toEqual(oneWinner);
    expect(
      codes(
        await attempts(() =>
          call(i, owner, 'POST', `/api/v1/organizations/${org.id}/projects`, { name: 'D', slug }),
        ),
      ),
    ).toEqual(oneWinner);
    expect(
      codes(
        await attempts(() =>
          call(i, owner, 'POST', `/api/v1/projects/${project.id}/workspaces`, { name: 'D', slug }),
        ),
      ),
    ).toEqual(oneWinner);
    const user = await userIn(i);
    expect(
      codes(
        await attempts(() =>
          call(i, owner, 'POST', `/api/v1/organizations/${org.id}/members`, { userId: user.id }),
        ),
      ),
    ).toEqual(oneWinner);
    // Renaming onto a taken slug conflicts.
    expect((await patch(i, owner, `/api/v1/projects/${project.id}`, { slug })).status).toBe(
      409,
    );

    // Optimistic concurrency: of many writers holding the same version exactly one wins.
    const current = (await call(i, owner, 'GET', `/api/v1/projects/${project.id}`)).data;
    const raced = await attempts(() =>
      patch(i, owner, `/api/v1/projects/${project.id}`, {
        name: 'Raced',
        expectedUpdatedAt: current.updatedAt,
      }),
    );
    expect(codes(raced)).toEqual([200, 409, 409, 409, 409, 409]);
  });

  it('denies and audits every direct-id request from another tenant', async () => {
    const a = await tree(i);
    const outsider = await userIn(i, [
      'organizations:read',
      'organizations:write',
      'projects:read',
      'projects:write',
      'workspaces:read',
      'workspaces:write',
    ]);
    const member = await addMember(i, a.owner, a.org.id, 'member');
    const org = `/api/v1/organizations/${a.org.id}`;
    const project = `/api/v1/projects/${a.project.id}`;
    const workspace = `/api/v1/workspaces/${a.workspace.id}`;
    const v = { expectedUpdatedAt: new Date(0).toISOString() };
    const requests: Array<['GET' | 'POST' | 'PATCH' | 'DELETE', string, object?]> = [
      ['GET', org],
      ['PATCH', org, { name: 'x', ...v }],
      ['DELETE', org],
      ['POST', `${org}/ownership`, { userId: outsider.id }],
      ['GET', `${org}/members`],
      ['POST', `${org}/members`, { userId: outsider.id, role: 'admin' }],
      ['PATCH', `${org}/members/${member.id}`, { role: 'viewer', ...v }],
      ['DELETE', `${org}/members/${member.id}`],
      ['GET', `${org}/projects`],
      ['POST', `${org}/projects`, { name: 'x' }],
      ['GET', `${org}/workspaces`],
      ['POST', `${org}/workspaces`, { name: 'x' }],
      ['GET', project],
      ['PATCH', project, { name: 'x', ...v }],
      ['DELETE', project],
      ['GET', `${project}/workspaces`],
      ['POST', `${project}/workspaces`, { name: 'x' }],
      ['GET', workspace],
      ['PATCH', workspace, { name: 'x', ...v }],
      ['DELETE', workspace],
    ];
    // The matrix must cover every tenant route that takes an id.
    await i.app.ready();
    const documented = Object.entries(
      (i.app as unknown as { swagger(): { paths: Record<string, object> } }).swagger().paths,
    )
      .filter(([path]) => /^\/api\/v1\/(organizations|projects|workspaces)\/\{/.test(path))
      .flatMap(([path, methods]) => Object.keys(methods).map((m) => `${m.toUpperCase()} ${path}`));
    const shape = (url: string) =>
      url
        .replace(member.id, '{userId}')
        .replace(a.org.id, '{id}')
        .replace(a.project.id, '{id}')
        .replace(a.workspace.id, '{id}');
    expect(requests.map(([m, url]) => `${m} ${shape(url)}`).sort()).toEqual(documented.sort());

    for (const [method, url, body] of requests) {
      const response = await call(i, outsider, method, url, body);
      expect(`${method} ${url} ${response.status}`).toBe(`${method} ${url} 404`);
    }
    const logged = await denials(i, outsider);
    expect(logged).toHaveLength(requests.length);
    for (const entry of logged) {
      expect(entry.metadata).toMatchObject({ organizationId: a.org.id, reason: 'not_a_member' });
      expect(entry.ipAddress).toBeTruthy();
    }
    expect(new Set(logged.map((e) => e.resource))).toEqual(
      new Set(['organization', 'project', 'workspace']),
    );
    // Nothing was changed by any of it.
    expect((await call(i, a.owner, 'GET', org)).data).toEqual(a.org);
    expect((await call(i, a.owner, 'GET', project)).data).toEqual(a.project);
    expect((await call(i, a.owner, 'GET', workspace)).data).toEqual(a.workspace);
  });

  it('audits role and foreign-parent denials, but not unknown ids', async () => {
    const a = await tree(i);
    const b = await tree(i);
    const viewer = await addMember(i, a.owner, a.org.id, 'viewer');
    expect((await call(i, viewer, 'DELETE', `/api/v1/projects/${a.project.id}`)).status).toBe(403);
    expect(await denials(i, viewer)).toEqual([
      expect.objectContaining({
        resource: 'project',
        resourceId: a.project.id,
        metadata: expect.objectContaining({ reason: 'insufficient_role', method: 'DELETE' }),
      }),
    ]);
    expect(
      (
        await call(i, a.owner, 'POST', `/api/v1/organizations/${a.org.id}/workspaces`, {
          name: 'x',
          projectId: b.project.id,
        })
      ).status,
    ).toBe(404);
    expect(
      (await patch(i, a.owner, `/api/v1/workspaces/${a.workspace.id}`, { projectId: b.project.id }))
        .status,
    ).toBe(404);
    for (const resource of ['organizations', 'projects', 'workspaces'])
      expect((await call(i, a.owner, 'GET', `/api/v1/${resource}/${randomUUID()}`)).status).toBe(
        404,
      );
    const logged = await denials(i, a.owner);
    expect(logged).toHaveLength(2);
    for (const entry of logged)
      expect(entry).toMatchObject({
        resource: 'project',
        resourceId: b.project.id,
        metadata: { organizationId: b.org.id, reason: 'cross_tenant_parent' },
      });
  });

  it('scopes lists, search, sorting, paging and totals to the caller', async () => {
    const a = await tree(i);
    const b = await tree(i);
    for (const resource of ['organizations', 'projects', 'workspaces']) {
      const own = resource === 'organizations' ? a.org : resource === 'projects' ? a.project : a.workspace;
      for (const query of ['', '?sort=name&order=asc', '?pageSize=1&sort=slug', '?search=a']) {
        const listed = await call(i, a.owner, 'GET', `/api/v1/${resource}${query}`);
        for (const item of listed.data as Array<{ id: string; organizationId?: string }>)
          expect(item.organizationId ?? item.id).toBe(a.org.id);
        expect(listed.body.meta.total).toBeLessThanOrEqual(1);
      }
      const all = await call(i, a.owner, 'GET', `/api/v1/${resource}`);
      expect(all.data.map((x: { id: string }) => x.id)).toEqual([own.id]);
      const beyond = await call(i, a.owner, 'GET', `/api/v1/${resource}?page=2`);
      expect(beyond.data).toEqual([]);
      expect(beyond.body.meta.total).toBe(1);
    }
    // Another tenant's name finds nothing.
    const search = await call(i, a.owner, 'GET', `/api/v1/organizations?search=${b.org.name}`);
    expect(search.body.meta.total).toBe(0);
  });

  it('requires the current version on every update', async () => {
    const { owner, org, project, workspace } = await tree(i);
    const member = await addMember(i, owner, org.id, 'member');
    const base = `/api/v1/organizations/${org.id}`;
    const targets: Array<[string, object]> = [
      [base, { name: unique('n') }],
      [`/api/v1/projects/${project.id}`, { name: 'n' }],
      [`/api/v1/workspaces/${workspace.id}`, { name: 'n' }],
      [`${base}/members/${member.id}`, { role: 'viewer' }],
    ];
    for (const [url, body] of targets)
      expect((await call(i, owner, 'PATCH', url, body)).status).toBe(400);

    const [loaded] = (await call(i, owner, 'GET', `${base}/members`)).data;
    const url = `${base}/members/${member.id}`;
    const change = (role: string) =>
      call(i, owner, 'PATCH', url, { role, expectedUpdatedAt: loaded.updatedAt });
    const first = await change('admin');
    expect(first.status).toBe(200);
    expect((await change('viewer')).status).toBe(409);
    expect((await call(i, owner, 'GET', `${base}/members`)).data[0].role).toBe('admin');
  });

  it('rechecks the actor inside every write', async () => {
    const a = await tree(i);
    const viewer = await addMember(i, a.owner, a.org.id, 'viewer');
    const outsider = await userIn(i);
    const at = new Date().toISOString();
    const row = { id: randomUUID(), organizationId: a.org.id, name: 'x', createdAt: at, updatedAt: at, deletedAt: null };
    const { organizations, memberships, projects, workspaces } = i.repos;
    for (const who of [viewer, outsider]) {
      const actor = { kind: 'user', userId: who.id } as const;
      const writes: Array<() => Promise<unknown>> = [
        () => organizations.update(a.org.id, { name: 'x' }, { at }, actor),
        () => organizations.archive(a.org.id, at, actor),
        () => memberships.add(a.org.id, outsider.id, 'admin', at, actor),
        () => memberships.update(a.org.id, viewer.id, { role: 'admin' }, { at }, actor),
        () => memberships.remove(a.org.id, randomUUID(), at, actor),
        () => projects.create({ ...row, slug: unique('p') }, actor),
        () => projects.update(a.project.id, { name: 'x' }, { at }, actor),
        () => projects.archive(a.project.id, at, actor),
        () => workspaces.create({ ...row, slug: unique('w'), environment: 'production' }, actor),
        () => workspaces.update(a.workspace.id, { name: 'x' }, { at }, actor),
        () => workspaces.archive(a.workspace.id, at, actor),
      ];
      for (const write of writes) await expect(write()).rejects.toBeInstanceOf(AccessDeniedError);
    }
    expect((await call(i, a.owner, 'GET', `/api/v1/projects/${a.project.id}`)).data).toEqual(a.project);
  });

  it('audits a foreign projectId sent to a project route', async () => {
    const a = await tree(i);
    const b = await tree(i);
    const response = await call(i, a.owner, 'POST', `/api/v1/projects/${a.project.id}/workspaces`, {
      name: 'x',
      projectId: b.project.id,
    });
    expect(response.status).toBe(400);
    expect(await denials(i, a.owner)).toEqual([
      expect.objectContaining({ resourceId: b.project.id }),
    ]);
  });

  it('lets only one of two concurrent ownership transfers win', async () => {
    const { owner, org } = await tree(i);
    const base = `/api/v1/organizations/${org.id}`;
    const x = await addMember(i, owner, org.id, 'member');
    const y = await addMember(i, owner, org.id, 'member');
    const results = await Promise.all(
      [x, y].map((u) => call(i, owner, 'POST', `${base}/ownership`, { userId: u.id })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    for (const r of results) expect([200, 403, 409]).toContain(r.status);
    await expect(
      i.repos.organizations.transferOwnership(org.id, x.id, new Date().toISOString(), owner.id),
    ).rejects.toBeInstanceOf(StaleWriteError);
  });

  it('derives usable slugs for non-Latin names and bounds pagination', async () => {
    const owner = await creator(i);
    const a = await call(i, owner, 'POST', '/api/v1/organizations', { name: 'سازمان یک' });
    const b = await call(i, owner, 'POST', '/api/v1/organizations', { name: 'سازمان دو' });
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.data.slug).toMatch(/^item-[0-9a-f]{8}$/);
    expect(b.data.slug).not.toBe(a.data.slug);
    const page = await call(
      i,
      owner,
      'GET',
      '/api/v1/organizations?pageSize=1&page=2&sort=createdAt&order=asc',
    );
    expect(page.data.map((o: { id: string }) => o.id)).toEqual([b.data.id]);
    expect(page.body.meta).toEqual({ total: 2, page: 2, pageSize: 1 });
    expect((await call(i, owner, 'GET', '/api/v1/organizations?pageSize=101')).status).toBe(400);
  });

  it('documents the routes in OpenAPI', async () => {
    const swagger = i.app as unknown as {
      swagger(): { paths: Record<string, Record<string, unknown>> };
    };
    await i.app.ready();
    const paths = swagger.swagger().paths;
    expect(Object.keys(paths['/api/v1/organizations/{id}']!).sort()).toEqual([
      'delete',
      'get',
      'patch',
    ]);
    for (const path of [
      '/api/v1/organizations/{id}/members',
      '/api/v1/organizations/{id}/members/{userId}',
      '/api/v1/organizations/{id}/ownership',
      '/api/v1/projects/{id}/workspaces',
    ])
      expect(paths).toHaveProperty([path]);
  });
};

/** Quotas, with limits small enough to hit. `start` returns two instances over the same state. */
const quotaBehaviour = (start: (quotas: TenantQuotas) => Promise<[Instance, Instance]>) => {
  it('enforces per-organization quotas, also under concurrency', async () => {
    const [one, two] = await start({ maxProjects: 3, maxWorkspaces: 2, maxMembers: 2 });
    const owner = await creator(one);
    const make = async () =>
      (await call(one, owner, 'POST', '/api/v1/organizations', { name: unique('q') })).data;
    const org = await make();
    const base = `/api/v1/organizations/${org.id}`;
    const burst = (path: string, body: () => Promise<object> | object) =>
      Promise.all(
        Array.from({ length: 8 }, async (_, n) =>
          call(n % 2 ? one : two, owner, 'POST', `${base}/${path}`, await body()),
        ),
      );
    const created = (rs: Array<{ status: number }>) => rs.filter((r) => r.status === 201).length;

    const projects = await burst('projects', () => ({ name: 'p', slug: unique('p') }));
    expect(created(projects)).toBe(3);
    const refused = projects.find((r) => r.status === 409)!;
    expect(refused.body.error).toMatchObject({ code: 'CONFLICT' });
    expect(created(await burst('workspaces', () => ({ name: 'w', slug: unique('w') })))).toBe(2);
    const users = await Promise.all(Array.from({ length: 8 }, () => userIn(one)));
    let next = 0;
    expect(created(await burst('members', () => ({ userId: users[next++]!.id })))).toBe(2);
    expect((await call(two, owner, 'GET', `${base}/projects`)).body.meta.total).toBe(3);
    expect((await call(two, owner, 'GET', `${base}/members`)).body.meta.total).toBe(2);

    // One tenant being full does not affect another.
    const other = await make();
    expect(
      (await call(one, owner, 'POST', `/api/v1/organizations/${other.id}/projects`, { name: 'p' }))
        .status,
    ).toBe(201);
    // Archiving and removing free a place.
    const first = projects.find((r) => r.status === 201)!.data;
    await call(one, owner, 'DELETE', `/api/v1/projects/${first.id}`);
    expect((await call(two, owner, 'POST', `${base}/projects`, { name: 'again' })).status).toBe(201);
    const [m] = (await call(one, owner, 'GET', `${base}/members`)).data;
    await call(one, owner, 'DELETE', `${base}/members/${m.userId}`);
    expect((await call(two, owner, 'POST', `${base}/members`, { userId: m.userId })).status).toBe(
      201,
    );
    await one.close();
    if (two !== one) await two.close();
  }, 60_000);
};

describe('tenant quota configuration', () => {
  it('has defaults and refuses values that would disable a limit', () => {
    expect(tenantQuotasFromEnv({})).toEqual({
      maxProjects: 100,
      maxWorkspaces: 500,
      maxMembers: 200,
    });
    expect(tenantQuotasFromEnv({ IRP_TENANT_MAX_PROJECTS: '7' }).maxProjects).toBe(7);
    for (const bad of ['0', '-1', 'many', '1.5', 'Infinity'])
      expect(() => tenantQuotasFromEnv({ IRP_TENANT_MAX_MEMBERS: bad })).toThrow(/positive integer/);
  });
});

describe('tenancy on development-memory repositories', () => {
  behaviour(async () => {
    const repos = createMemoryIdentityRepositories();
    const app = await buildServer({ identity: repos, mailer: new CapturingEmailSender() });
    return { app, repos, close: () => app.close() };
  });
  quotaBehaviour(async (quotas) => {
    const repos = createMemoryIdentityRepositories(quotas);
    const app = await buildServer({ identity: repos, mailer: new CapturingEmailSender() });
    const only = { app, repos, close: () => app.close() };
    return [only, only];
  });
});

(adminUrl ? describe : describe.skip)('tenancy on PostgreSQL (real database)', () => {
  /** An independent API instance: its own connection pool, repositories and server. */
  const instance = async (quotas?: TenantQuotas): Promise<Instance> => {
    const sql = createSqlClient(databaseUrl(), { max: 6 });
    const repos = createPostgresIdentityRepositories(sql, quotas);
    const app = await buildServer({ identity: repos, mailer: new CapturingEmailSender() });
    // Closing the server ends its pool (onClose hook).
    return { app, repos, close: () => app.close() };
  };

  beforeAll(async () => {
    await admin(`CREATE DATABASE ${dbName}`);
    const c = new pg.Client({ connectionString: databaseUrl() });
    await c.connect();
    const migrations = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const m of migrations)
      await c.query(readFileSync(join(migrationsDir, m, 'migration.sql'), 'utf8'));
    await c.end();
  }, 60_000);
  afterAll(async () => {
    await admin(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  }, 60_000);

  behaviour(() => instance());
  quotaBehaviour(async (quotas) => [await instance(quotas), await instance(quotas)]);

  it('hides live children of archived parents left by older data, even from platform admins', async () => {
    const one = await instance();
    const a = await tree(one);
    const b = await tree(one);
    const root = await userIn(one, [], ['platform_admin']);
    // Soft-delete parents only, as data written before cascading archive would look.
    const probe = createSqlClient(databaseUrl(), { max: 1 });
    await probe.query(`UPDATE "Organization" SET "deletedAt" = now() WHERE "id" = $1`, [a.org.id]);
    await probe.query(`UPDATE "Project" SET "deletedAt" = now() WHERE "id" = $1`, [b.project.id]);
    await probe.end();
    for (const who of [root, a.owner])
      expect((await call(one, who, 'GET', `/api/v1/projects/${a.project.id}`)).status).toBe(404);
    for (const who of [root, b.owner])
      expect((await call(one, who, 'GET', `/api/v1/workspaces/${b.workspace.id}`)).status).toBe(404);
    const listed = async (resource: string) =>
      (await call(one, root, 'GET', `/api/v1/${resource}?pageSize=100`)).data.map(
        (x: { id: string }) => x.id,
      );
    expect(await listed('projects')).not.toContain(a.project.id);
    expect(await listed('workspaces')).not.toContain(a.workspace.id);
    expect(await listed('workspaces')).not.toContain(b.workspace.id);
    await one.close();
  });

  it('never promotes a member who is being removed', async () => {
    const one = await instance();
    const two = await instance();
    for (let round = 0; round < 8; round += 1) {
      const { owner, org } = await tree(one);
      const next = await addMember(one, owner, org.id, 'member');
      const base = `/api/v1/organizations/${org.id}`;
      const [transfer, removal] = await Promise.all([
        call(one, owner, 'POST', `${base}/ownership`, { userId: next.id }),
        call(two, owner, 'DELETE', `${base}/members/${next.id}`),
      ]);
      // Never both: a successful removal means the user did not become owner.
      expect(transfer.status === 200 && removal.status === 200).toBe(false);
    }
    await one.close();
    await two.close();
  }, 60_000);

  /**
   * Starts `request` while another transaction holds the organization row, waits until the request is
   * blocked on it (so route authorization has already passed), applies `change`, then commits.
   */
  const interleave = async <T>(
    organizationId: string,
    change: (holder: pg.Client) => Promise<unknown>,
    request: () => Promise<T>,
  ): Promise<T> => {
    const holder = new pg.Client({ connectionString: databaseUrl() });
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT 1 FROM "Organization" WHERE "id" = $1 FOR UPDATE', [organizationId]);
      const pending = request();
      for (let attempt = 0; ; attempt += 1) {
        const waiting = await holder.query(
          `SELECT 1 FROM pg_stat_activity WHERE datname = $1 AND wait_event_type = 'Lock'`,
          [dbName],
        );
        if (waiting.rowCount) break;
        if (attempt > 200) throw new Error('the request never waited for the organization lock');
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await change(holder);
      await holder.query('COMMIT');
      return await pending;
    } finally {
      await holder.end();
    }
  };

  it('stops an in-flight write whose actor is revoked before it commits', async () => {
    const one = await instance();
    const a = await tree(one);
    const org = `/api/v1/organizations/${a.org.id}`;
    const manager = await addMember(one, a.owner, a.org.id, 'admin');
    const accomplice = await userIn(one);
    const revoke = (c: pg.Client) =>
      c.query(`UPDATE "Membership" SET "status" = 'removed' WHERE "userId" = $1`, [manager.id]);
    const added = await interleave(a.org.id, revoke, () =>
      call(one, manager, 'POST', `${org}/members`, { userId: accomplice.id, role: 'admin' }),
    );
    expect(added.status).toBe(404);
    expect((await call(one, accomplice, 'GET', org)).status).toBe(404);
    expect(await denials(one, manager)).toHaveLength(1);

    const next = await addMember(one, a.owner, a.org.id, 'admin');
    const archived = await interleave(
      a.org.id,
      (c) => c.query(`UPDATE "Organization" SET "ownerUserId" = $2 WHERE "id" = $1`, [a.org.id, next.id]),
      () => call(one, a.owner, 'DELETE', org),
    );
    expect(archived.status).toBe(404); // the former owner has no membership in this simulation
    expect((await call(one, next, 'GET', org)).status).toBe(200);

    const writer = await addMember(one, next, a.org.id, 'member');
    const version = (await call(one, next, 'GET', `/api/v1/projects/${a.project.id}`)).data.updatedAt;
    const patched = await interleave(
      a.org.id,
      (c) => c.query(`UPDATE "Membership" SET "status" = 'suspended' WHERE "userId" = $1`, [writer.id]),
      () =>
        call(one, writer, 'PATCH', `/api/v1/projects/${a.project.id}`, {
          name: 'late',
          expectedUpdatedAt: version,
        }),
    );
    expect(patched.status).toBe(404);
    await one.close();
  }, 60_000);

  it('is not starved of a member removal by continuous writes', async () => {
    const writers = [await instance(), await instance(), await instance(), await instance()];
    const { owner, org, project } = await tree(writers[0]!);
    const member = await addMember(writers[0]!, owner, org.id, 'member');
    let running = true;
    let wrote = 0;
    const loops = writers.flatMap((one) =>
      Array.from({ length: 8 }, async () => {
        while (running) {
          try {
            await one.repos.projects.update(project.id, { name: 'busy' }, { at: new Date().toISOString() }, { kind: 'user', userId: member.id });
            wrote += 1;
          } catch (error) {
            if (error instanceof AccessDeniedError) return;
            throw error;
          }
        }
      }),
    );
    try {
      while (wrote < 50) await new Promise((resolve) => setTimeout(resolve, 10));
      const started = Date.now();
      await writers[0]!.repos.memberships.remove(org.id, member.id, new Date().toISOString(), { kind: 'user', userId: owner.id });
      expect(Date.now() - started).toBeLessThan(5_000);
      await Promise.all(loops);
    } finally {
      running = false;
      await Promise.allSettled(loops);
      for (const one of writers) await one.close();
    }
  }, 60_000);

  it('lets only one of several concurrent role changes win', async () => {
    const one = await instance();
    const two = await instance();
    const { owner, org } = await tree(one);
    const member = await addMember(one, owner, org.id, 'member');
    const base = `/api/v1/organizations/${org.id}/members`;
    for (let round = 0; round < 10; round += 1) {
      const [current] = (await call(one, owner, 'GET', base)).data;
      const results = await Promise.all(
        [one, two, one, two].map((x) =>
          call(x, owner, 'PATCH', `${base}/${member.id}`, {
            role: round % 2 ? 'member' : 'viewer',
            expectedUpdatedAt: current.updatedAt,
          }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409]);
    }
    await one.close();
    await two.close();
  }, 60_000);

  it('grants nothing for a role slug the application does not know', async () => {
    const one = await instance();
    const a = await tree(one);
    const member = await addMember(one, a.owner, a.org.id, 'viewer');
    const probe = createSqlClient(databaseUrl(), { max: 1 });
    await probe.query(
      `UPDATE "Role" SET "slug" = 'legacy-readonly' WHERE "organizationId" = $1 AND "slug" = 'viewer'`,
      [a.org.id],
    );
    await probe.end();
    const org = `/api/v1/organizations/${a.org.id}`;
    expect((await call(one, member, 'GET', org)).status).toBe(404);
    expect((await call(one, member, 'DELETE', org)).status).toBe(404);
    expect((await call(one, member, 'GET', '/api/v1/organizations')).status).toBe(403);
    await one.close();
  });

  it('does not count workspaces hidden under an archived project against the quota', async () => {
    const one = await instance({ maxProjects: 5, maxWorkspaces: 1, maxMembers: 5 });
    const a = await tree(one);
    const probe = createSqlClient(databaseUrl(), { max: 1 });
    await probe.query(`UPDATE "Project" SET "deletedAt" = now() WHERE "id" = $1`, [a.project.id]);
    await probe.end();
    const created = await call(one, a.owner, 'POST', `/api/v1/organizations/${a.org.id}/workspaces`, {
      name: 'replacement',
    });
    expect(created.status).toBe(201);
    await one.close();
  });

  it('refuses to list tenant data without a tenant scope', async () => {
    const one = await instance();
    const query = { page: 1, pageSize: 10, sort: 'createdAt', order: 'desc' as const };
    for (const repository of [one.repos.organizations, one.repos.projects, one.repos.workspaces])
      await expect(repository.list(query, undefined as never)).rejects.toThrow(/tenant scope/);
    await one.close();
  });

  it('keeps denial audit records across a restart', async () => {
    const first = await instance();
    const { org } = await tree(first);
    const outsider = await userIn(first);
    await call(first, outsider, 'GET', `/api/v1/organizations/${org.id}`);
    await first.close();
    const second = await instance();
    expect(await denials(second, outsider)).toHaveLength(1);
    await second.close();
  });

  it('keeps everything across an API restart', async () => {
    const first = await instance();
    const { owner, org, project, workspace } = await tree(first);
    const member = await addMember(first, owner, org.id, 'member');
    await patch(first, owner, `/api/v1/workspaces/${workspace.id}`, {
      environment: 'development',
    });
    await first.close();

    const second = await instance();
    expect((await call(second, owner, 'GET', `/api/v1/organizations/${org.id}`)).data.name).toBe(
      org.name,
    );
    expect(
      (await call(second, owner, 'GET', `/api/v1/projects/${project.id}`)).data.organizationId,
    ).toBe(org.id);
    expect(
      (await call(second, member, 'GET', `/api/v1/workspaces/${workspace.id}`)).data,
    ).toMatchObject({ environment: 'development', projectId: project.id });
    await second.close();
  });

  it('shows one state to two independent instances', async () => {
    const one = await instance();
    const two = await instance();
    const { owner, org, project } = await tree(one);
    const member = await userIn(two);
    expect((await call(two, owner, 'GET', `/api/v1/projects/${project.id}`)).status).toBe(200);
    expect(
      (
        await call(two, owner, 'POST', `/api/v1/organizations/${org.id}/members`, {
          userId: member.id,
        })
      ).status,
    ).toBe(201);
    expect((await call(one, member, 'GET', `/api/v1/organizations/${org.id}`)).status).toBe(200);
    await call(one, owner, 'DELETE', `/api/v1/organizations/${org.id}/members/${member.id}`);
    expect((await call(two, member, 'GET', `/api/v1/organizations/${org.id}`)).status).toBe(404);

    const version = (await call(one, owner, 'GET', `/api/v1/projects/${project.id}`)).data
      .updatedAt;
    const results = await Promise.all(
      [one, two].map((x, n) =>
        patch(x, owner, `/api/v1/projects/${project.id}`, {
          name: `from-${n}`,
          expectedUpdatedAt: version,
        }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const slug = unique('both');
    const creates = await Promise.all(
      [one, two].map((x) =>
        call(x, owner, 'POST', `/api/v1/organizations/${org.id}/projects`, { name: 'Same', slug }),
      ),
    );
    expect(creates.map((r) => r.status).sort()).toEqual([201, 409]);
    await one.close();
    await two.close();
  });

  it('never leaves a live child under an archived parent when archive and create race', async () => {
    const one = await instance();
    const two = await instance();
    const owner = await creator(one);
    const probe = createSqlClient(databaseUrl(), { max: 1 });
    for (let round = 0; round < 8; round += 1) {
      const org = (
        await call(one, owner, 'POST', '/api/v1/organizations', { name: unique('race') })
      ).data;
      const project = (
        await call(one, owner, 'POST', `/api/v1/organizations/${org.id}/projects`, { name: 'p' })
      ).data;
      const target =
        round % 2 ? `/api/v1/organizations/${org.id}` : `/api/v1/projects/${project.id}`;
      const outcomes = await Promise.all([
        call(one, owner, 'DELETE', target),
        ...Array.from({ length: 4 }, (_, n) =>
          call(two, owner, 'POST', `/api/v1/projects/${project.id}/workspaces`, { name: `w${n}` }),
        ),
      ]);
      expect(outcomes[0]!.status).toBe(200);
      for (const outcome of outcomes.slice(1)) expect([201, 404]).toContain(outcome.status);
      const orphans = await probe.query(
        `SELECT w."id" FROM "Workspace" w JOIN "Project" p ON p."id" = w."projectId" JOIN "Organization" o ON o."id" = w."organizationId"
         WHERE w."organizationId" = $1 AND w."deletedAt" IS NULL AND (p."deletedAt" IS NOT NULL OR o."deletedAt" IS NOT NULL)`,
        [org.id],
      );
      expect(orphans).toEqual([]);
    }
    await probe.end();
    await one.close();
    await two.close();
  }, 60_000);

  it('guards parents inside the repository transaction, not only in the routes', async () => {
    const one = await instance();
    const a = await tree(one);
    const b = await tree(one);
    const t = new Date().toISOString();
    const row = {
      id: randomUUID(),
      organizationId: a.org.id,
      projectId: b.project.id,
      name: 'x',
      slug: unique('x'),
      environment: 'production',
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
    };
    const all = { kind: 'all' } as const;
    await expect(one.repos.workspaces.create(row, all)).rejects.toBeInstanceOf(MissingParentError);
    await expect(
      one.repos.workspaces.update(a.workspace.id, { projectId: b.project.id }, { at: t }, all),
    ).rejects.toBeInstanceOf(MissingParentError);
    await one.close();
  });
});
