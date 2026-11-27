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
import { MissingParentError, type IdentityRepositories } from './identity/types.js';

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
    const updated = await call(i, owner, 'PATCH', url, { name: 'Acme Networks' });
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

    const p = await call(i, owner, 'PATCH', `/api/v1/projects/${project.id}`, {
      name: 'Beta',
      description: 'edge routing',
    });
    expect(p.data).toMatchObject({
      name: 'Beta',
      description: 'edge routing',
      organizationId: org.id,
    });
    expect(
      (await call(i, owner, 'PATCH', `/api/v1/projects/${project.id}`, { description: null })).data
        .description,
    ).toBeUndefined();
    const w = await call(i, owner, 'PATCH', `/api/v1/workspaces/${workspace.id}`, {
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
          await call(i, who, 'PATCH', `/api/v1/workspaces/${a.workspace.id}`, {
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
        await call(i, a.owner, 'PATCH', `/api/v1/projects/${a.project.id}`, {
          organizationId: b.org.id,
          name: 'moved',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(i, a.owner, 'PATCH', `/api/v1/workspaces/${a.workspace.id}`, {
          organizationId: b.org.id,
          name: 'moved',
        })
      ).status,
    ).toBe(400);
    expect(
      (await call(i, a.owner, 'PATCH', `/api/v1/workspaces/${a.workspace.id}`, { projectId: null }))
        .status,
    ).toBe(400);
    expect((await call(i, a.owner, 'PATCH', `/api/v1/projects/${a.project.id}`, {})).status).toBe(
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
        await call(i, a.owner, 'PATCH', `/api/v1/workspaces/${a.workspace.id}`, {
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
      (await call(i, viewer, 'PATCH', `/api/v1/workspaces/${workspace.id}`, { name: 'no' })).status,
    ).toBe(403);
    // Membership does not grant the right to create organizations.
    expect((await call(i, member, 'POST', '/api/v1/organizations', { name: 'no' })).status).toBe(
      403,
    );

    expect((await call(i, member, 'POST', `${base}/projects`, { name: 'By member' })).status).toBe(
      201,
    );
    expect(
      (await call(i, member, 'PATCH', `/api/v1/projects/${project.id}`, { name: 'Edited' })).status,
    ).toBe(200);
    expect((await call(i, member, 'DELETE', `/api/v1/projects/${project.id}`)).status).toBe(403);
    expect((await call(i, member, 'PATCH', base, { name: 'no' })).status).toBe(403);
    expect(
      (await call(i, member, 'POST', `${base}/members`, { email: stranger.email })).status,
    ).toBe(403);
    expect((await call(i, member, 'DELETE', `${base}/members/${viewer.id}`)).status).toBe(403);

    expect((await call(i, manager, 'PATCH', base, { name: unique('Renamed') })).status).toBe(200);
    expect((await call(i, manager, 'DELETE', base)).status).toBe(403);
    expect(
      (await call(i, manager, 'POST', `${base}/ownership`, { userId: manager.id })).status,
    ).toBe(403);
    // The owner is not a membership and cannot be added, changed or removed as one.
    expect((await call(i, manager, 'POST', `${base}/members`, { userId: owner.id })).status).toBe(
      409,
    );
    expect(
      (await call(i, manager, 'PATCH', `${base}/members/${owner.id}`, { role: 'viewer' })).status,
    ).toBe(404);
    expect((await call(i, manager, 'DELETE', `${base}/members/${owner.id}`)).status).toBe(404);

    expect((await call(i, manager, 'POST', `${base}/members`, { userId: viewer.id })).status).toBe(
      409,
    );
    expect(
      (await call(i, manager, 'POST', `${base}/members`, { email: 'nobody@example.com' })).status,
    ).toBe(404);
    expect(
      (await call(i, manager, 'PATCH', `${base}/members/${viewer.id}`, { role: 'member' })).data
        .role,
    ).toBe('member');
    expect((await call(i, viewer, 'POST', `${base}/projects`, { name: 'Promoted' })).status).toBe(
      201,
    );
    // Suspension and removal take effect on the next request.
    expect(
      (await call(i, manager, 'PATCH', `${base}/members/${viewer.id}`, { status: 'suspended' }))
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
    expect((await call(i, owner, 'PATCH', `/api/v1/projects/${project.id}`, { slug })).status).toBe(
      409,
    );

    // Optimistic concurrency: of many writers holding the same version exactly one wins.
    const current = (await call(i, owner, 'GET', `/api/v1/projects/${project.id}`)).data;
    const raced = await attempts(() =>
      call(i, owner, 'PATCH', `/api/v1/projects/${project.id}`, {
        name: 'Raced',
        expectedUpdatedAt: current.updatedAt,
      }),
    );
    expect(codes(raced)).toEqual([200, 409, 409, 409, 409, 409]);
    // Without a version, updates to different fields do not overwrite each other.
    await Promise.all([
      call(i, owner, 'PATCH', `/api/v1/projects/${project.id}`, { name: 'Left' }),
      call(i, owner, 'PATCH', `/api/v1/projects/${project.id}`, { description: 'Right' }),
    ]);
    expect((await call(i, owner, 'GET', `/api/v1/projects/${project.id}`)).data).toMatchObject({
      name: 'Left',
      description: 'Right',
    });
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

describe('tenancy on development-memory repositories', () => {
  behaviour(async () => {
    const repos = createMemoryIdentityRepositories();
    const app = await buildServer({ identity: repos, mailer: new CapturingEmailSender() });
    return { app, repos, close: () => app.close() };
  });
});

(adminUrl ? describe : describe.skip)('tenancy on PostgreSQL (real database)', () => {
  /** An independent API instance: its own connection pool, repositories and server. */
  const instance = async (): Promise<Instance> => {
    const repos = createPostgresIdentityRepositories(createSqlClient(databaseUrl(), { max: 6 }));
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

  behaviour(instance);

  it('keeps everything across an API restart', async () => {
    const first = await instance();
    const { owner, org, project, workspace } = await tree(first);
    const member = await addMember(first, owner, org.id, 'member');
    await call(first, owner, 'PATCH', `/api/v1/workspaces/${workspace.id}`, {
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
        call(x, owner, 'PATCH', `/api/v1/projects/${project.id}`, {
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
    await expect(one.repos.workspaces.create(row)).rejects.toBeInstanceOf(MissingParentError);
    await expect(
      one.repos.workspaces.update(a.workspace.id, { projectId: b.project.id }, { at: t }),
    ).rejects.toBeInstanceOf(MissingParentError);
    await one.close();
  });
});
