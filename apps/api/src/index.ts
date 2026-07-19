import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { z } from 'zod';
import { loadConfig } from '@irp/config';
import { ConflictAppError, ForbiddenAppError, NotFoundAppError, UnauthorizedAppError, ValidationAppError, createDomainEvent, mapErrorToHttp } from '@irp/core';
import { createLogger } from '@irp/logger';
import { createHealthStatus, httpRequestDuration, networkHealthScore, networkLatencyMs, probeFailureTotal, probeSuccessTotal, renderPrometheusMetrics } from '@irp/telemetry';
import { NetworkMonitoringService, type NetworkProbe } from '@irp/network';
import { JwtAuthenticationProvider, JwtService, RbacAuthorization, hashPassword, verifyPassword, type Principal } from '@irp/auth';
import { InMemoryEventBus } from '@irp/events';
import { MemoryQueue } from '@irp/queue';
import { checkDatabaseHealth, createPrismaClient } from '@irp/database';

type Entity = { id: string; createdAt: string; updatedAt: string; deletedAt?: string | null };
type User = Entity & { email: string; name: string; passwordHash: string; status: 'pending' | 'active' | 'suspended'; emailVerifiedAt?: string; roles: string[]; permissions: string[] };
type Organization = Entity & { name: string; slug: string };
type Project = Entity & { organizationId: string; name: string; slug: string; description?: string };
type Workspace = Entity & { organizationId: string; projectId?: string; name: string; slug: string; environment: string };
type Session = { id: string; userId: string; refreshToken: string; expiresAt: string; revokedAt?: string };
const now = () => new Date().toISOString();
const slugify = (v: string) => v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const ok = <T>(data: T, meta?: unknown) => ({ success: true, data, ...(meta ? { meta } : {}) });
const created = <T extends Entity>(data: T) => ok(data);
const publicUser = (user: User) => ({ id: user.id, email: user.email, name: user.name, status: user.status, emailVerifiedAt: user.emailVerifiedAt ?? null, roles: user.roles, permissions: user.permissions, createdAt: user.createdAt, updatedAt: user.updatedAt });
const paginationSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25), sort: z.string().default('createdAt'), order: z.enum(['asc', 'desc']).default('desc'), search: z.string().optional() });
const password = z.string().min(12).max(256).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/);
const registerSchema = z.object({ email: z.string().email().toLowerCase(), name: z.string().min(1).max(120), password });
const loginSchema = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1) });
const nameSchema = z.object({ name: z.string().min(1).max(120), slug: z.string().min(1).max(80).optional(), description: z.string().max(1000).optional() });
const workspaceSchema = nameSchema.extend({ projectId: z.string().uuid().optional(), environment: z.enum(['development', 'staging', 'production']).default('production') });
const idParams = z.object({ id: z.string().uuid() });
class Store<T extends Entity> { private readonly rows = new Map<string, T>(); list(query: z.infer<typeof paginationSchema>, filter: (item: T) => boolean = () => true) { const items = [...this.rows.values()].filter((i) => !i.deletedAt).filter(filter).sort((a, b) => query.order === 'asc' ? String(a[query.sort as keyof T] ?? '').localeCompare(String(b[query.sort as keyof T] ?? '')) : String(b[query.sort as keyof T] ?? '').localeCompare(String(a[query.sort as keyof T] ?? ''))); const start = (query.page - 1) * query.pageSize; return { items: items.slice(start, start + query.pageSize), total: items.length, page: query.page, pageSize: query.pageSize }; } get(id: string) { const item = this.rows.get(id); return item && !item.deletedAt ? item : null; } put(row: T) { this.rows.set(row.id, row); return row; } find(fn: (item: T) => boolean) { return [...this.rows.values()].find((i) => !i.deletedAt && fn(i)) ?? null; } softDelete(id: string) { const row = this.get(id); if (!row) throw new NotFoundAppError('resource'); row.deletedAt = now(); row.updatedAt = now(); } }
const users = new Store<User>(); const orgs = new Store<Organization>(); const projects = new Store<Project>(); const workspaces = new Store<Workspace>(); const sessions = new Map<string, Session>();
const permissions = ['users:read','users:write','organizations:read','organizations:write','projects:read','projects:write','workspaces:read','workspaces:write'];
const requireAuth = async (request: FastifyRequest): Promise<Principal> => { const principal = await request.jwtAuth.authenticate({ headers: request.headers }); if (!principal) throw new UnauthorizedAppError(); return principal; };
const requirePermission = async (request: FastifyRequest, permission: string) => { const principal = await requireAuth(request); if (!await request.rbac.authorize({ principal, resource: request.url, action: request.method, requiredPermissions: [permission] })) throw new ForbiddenAppError(); return principal; };
declare module 'fastify' { interface FastifyRequest { jwtAuth: JwtAuthenticationProvider; rbac: RbacAuthorization; } }
export const buildServer = async (): Promise<FastifyInstance> => {
  const config = loadConfig(); const logger = createLogger({ level: config.logger.level, pretty: false, service: 'irp-api' });
  const testProbe: NetworkProbe = { name: 'test-dns', type: 'dns', config: {}, async execute() { return { name: 'test-dns', probeType: 'dns', success: true, latencyMs: 1, timestamp: new Date().toISOString(), metadata: { environment: 'test' } }; } };
  const networkMonitor = process.env.NODE_ENV === 'test' ? new NetworkMonitoringService([testProbe], undefined, 60_000, 0) : new NetworkMonitoringService();
  const app = Fastify({ logger: false, genReqId: (request) => request.headers['x-request-id']?.toString() ?? crypto.randomUUID() });
  const jwt = new JwtService(process.env.JWT_SECRET ?? 'development-secret-development-secret-32', 'irp'); const jwtAuth = new JwtAuthenticationProvider(jwt); const rbac = new RbacAuthorization(); const events = new InMemoryEventBus(); const queue = new MemoryQueue(); const db = createPrismaClient(process.env.DATABASE_URL);
  app.decorateRequest('jwtAuth', undefined as unknown as JwtAuthenticationProvider); app.decorateRequest('rbac', undefined as unknown as RbacAuthorization);
  app.setErrorHandler((error, _request, reply) => { const mapped = error instanceof z.ZodError ? mapErrorToHttp(new ValidationAppError('Invalid request', { issues: error.issues })) : mapErrorToHttp(error); reply.status(mapped.statusCode).send(mapped.body); });
  app.addHook('onRequest', async (request) => { request.jwtAuth = jwtAuth; request.rbac = rbac; request.headers['x-correlation-id'] = request.headers['x-correlation-id'] ?? request.id; });
  app.addHook('onResponse', async (request, reply) => { httpRequestDuration.observe({ method: request.method, route: request.routeOptions.url ?? request.url, status_code: String(reply.statusCode) }, reply.elapsedTime / 1000); logger.info('request completed', { requestId: request.id, method: request.method, url: request.url, statusCode: reply.statusCode }); });
  await app.register(cors); await app.register(helmet); await app.register(swagger, { openapi: { info: { title: 'InternetResiliencePlatform API', version: config.app.version }, servers: [{ url: '/api/v1' }] } }); await app.register(swaggerUi, { routePrefix: '/docs' });
  app.get('/api/v1/health', async () => ok(createHealthStatus({ api: 'healthy' })));
  app.get('/api/v1/ready', async () => { let database: 'healthy' | 'degraded' = 'healthy'; try { await checkDatabaseHealth(db); } catch { database = 'degraded'; } return ok(createHealthStatus({ api: 'healthy', database, queue: queue.size() >= 0 ? 'healthy' : 'unhealthy' })); });
  app.get('/api/v1/live', async () => ok(createHealthStatus({ process: 'healthy' })));
  app.get('/api/v1/version', async () => ok({ name: config.app.name, version: config.app.version, environment: config.app.environment }));
  app.get('/api/v1/metrics', async (_r, reply) => reply.type('text/plain').send(await renderPrometheusMetrics()));
  const recordNetworkTelemetry = (snapshot: Awaited<ReturnType<NetworkMonitoringService['runOnce']>>) => {
    networkHealthScore.set(snapshot.score.score);
    for (const measurement of snapshot.measurements) {
      const labels = { probe_type: measurement.probeType, probe_name: String(measurement.metadata['probeName'] ?? measurement.probeType) };
      if (measurement.success) probeSuccessTotal.inc(labels); else probeFailureTotal.inc(labels);
      if (typeof measurement.latency === 'number') networkLatencyMs.observe(labels, measurement.latency);
    }
  };
  app.get('/api/v1/health/network', async () => ok(networkMonitor.snapshot()));
  app.get('/api/v1/metrics/network', async () => ok({ latest: networkMonitor.snapshot().score, measurements: networkMonitor.measurements().length }));
  app.get('/api/v1/measurements', async (request) => { const q = paginationSchema.parse(request.query); const rows = networkMonitor.measurements().slice((q.page - 1) * q.pageSize, q.page * q.pageSize); return ok(rows, { total: networkMonitor.measurements().length, page: q.page, pageSize: q.pageSize }); });
  app.post('/api/v1/probes/run', async () => { const snapshot = await networkMonitor.runOnce(); recordNetworkTelemetry(snapshot); logger.info('network probes completed', { status: snapshot.status, score: snapshot.score.score, issues: snapshot.issues }); return ok(snapshot); });

  app.post('/api/v1/auth/register', async (request, reply) => { const input = registerSchema.parse(request.body); if (users.find((u) => u.email === input.email)) throw new ConflictAppError('Email is already registered.'); const user = users.put({ id: crypto.randomUUID(), email: input.email, name: input.name, passwordHash: hashPassword(input.password), status: 'active', roles: ['platform_admin'], permissions, createdAt: now(), updatedAt: now() }); await events.publish(createDomainEvent('user.registered', user.id, { email: user.email })); return reply.code(201).send(created(publicUser(user) as never)); });
  app.post('/api/v1/auth/login', async (request) => { const input = loginSchema.parse(request.body); const user = users.find((u) => u.email === input.email); if (!user || !verifyPassword(input.password, user.passwordHash)) throw new UnauthorizedAppError('Invalid credentials'); const session: Session = { id: crypto.randomUUID(), userId: user.id, refreshToken: crypto.randomUUID(), expiresAt: new Date(Date.now()+30*86400_000).toISOString() }; sessions.set(session.id, session); const accessToken = jwt.sign({ sub: user.id, roles: user.roles, scopes: user.permissions, sessionId: session.id, type: 'access', ttlSeconds: 900 }); const refreshToken = jwt.sign({ sub: user.id, roles: user.roles, scopes: user.permissions, sessionId: session.id, type: 'refresh', ttlSeconds: 30*86400 }); return ok({ accessToken, refreshToken, expiresIn: 900, user: publicUser(user) }); });
  app.post('/api/v1/auth/refresh', async (request) => { const token = z.object({ refreshToken: z.string() }).parse(request.body).refreshToken; const claims = jwt.verify(token, 'refresh'); const user = users.get(claims.sub); if (!user || !claims.sessionId || !sessions.has(claims.sessionId)) throw new UnauthorizedAppError(); return ok({ accessToken: jwt.sign({ sub: user.id, roles: user.roles, scopes: user.permissions, sessionId: claims.sessionId, type: 'access', ttlSeconds: 900 }), expiresIn: 900 }); });
  app.post('/api/v1/auth/logout', async (request) => { const p = await requireAuth(request); const sid = String(p.metadata?.sessionId ?? ''); const s = sessions.get(sid); if (s) s.revokedAt = now(); return ok({ loggedOut: true }); });
  app.post('/api/v1/auth/password-reset/request', async (request) => { z.object({ email: z.string().email() }).parse(request.body); return ok({ accepted: true }); });
  app.post('/api/v1/auth/email-verification/request', async (request) => { await requireAuth(request); return ok({ accepted: true }); });
  const listUsers = async (request: FastifyRequest) => { await requirePermission(request, 'users:read'); const q = paginationSchema.parse(request.query); const result = users.list(q, (u) => !q.search || u.email.includes(q.search) || u.name.includes(q.search)); return ok(result.items.map(publicUser), { total: result.total, page: result.page, pageSize: result.pageSize }); };
  app.get('/api/v1/users', listUsers); app.get('/api/v1/users/:id', async (request) => { await requirePermission(request,'users:read'); const user = users.get(idParams.parse(request.params).id); if (!user) throw new NotFoundAppError('user'); return ok(publicUser(user)); });
  app.get('/api/v1/me', async (request) => { const p = await requireAuth(request); const user = users.get(p.id); if (!user) throw new NotFoundAppError('user'); return ok(publicUser(user)); });
  app.get('/api/v1/organizations', async (request) => { await requirePermission(request,'organizations:read'); const q = paginationSchema.parse(request.query); const r = orgs.list(q, (o) => !q.search || o.name.includes(q.search)); return ok(r.items, { total: r.total, page: r.page, pageSize: r.pageSize }); });
  app.post('/api/v1/organizations', async (request, reply) => { await requirePermission(request,'organizations:write'); const i = nameSchema.parse(request.body); const slug = i.slug ?? slugify(i.name); if (orgs.find((o)=>o.slug===slug)) throw new ConflictAppError('Organization slug already exists.'); return reply.code(201).send(created(orgs.put({ id: crypto.randomUUID(), name: i.name, slug, createdAt: now(), updatedAt: now() }))); });
  app.get('/api/v1/organizations/:id', async (request) => { await requirePermission(request,'organizations:read'); const o = orgs.get(idParams.parse(request.params).id); if(!o) throw new NotFoundAppError('organization'); return ok(o); });
  app.delete('/api/v1/organizations/:id', async (request) => { await requirePermission(request,'organizations:write'); orgs.softDelete(idParams.parse(request.params).id); return ok({ deleted: true }); });
  app.get('/api/v1/projects', async (request) => { await requirePermission(request,'projects:read'); const q = paginationSchema.parse(request.query); const r = projects.list(q); return ok(r.items, { total: r.total, page: r.page, pageSize: r.pageSize }); });
  app.post('/api/v1/organizations/:id/projects', async (request, reply) => { await requirePermission(request,'projects:write'); const organizationId = idParams.parse(request.params).id; if(!orgs.get(organizationId)) throw new NotFoundAppError('organization'); const i = nameSchema.parse(request.body); const slug = i.slug ?? slugify(i.name); return reply.code(201).send(created(projects.put({ id: crypto.randomUUID(), organizationId, name: i.name, slug, ...(i.description ? { description: i.description } : {}), createdAt: now(), updatedAt: now() }))); });
  app.get('/api/v1/projects/:id', async (request) => { await requirePermission(request,'projects:read'); const p = projects.get(idParams.parse(request.params).id); if(!p) throw new NotFoundAppError('project'); return ok(p); });
  app.get('/api/v1/workspaces', async (request) => { await requirePermission(request,'workspaces:read'); const q = paginationSchema.parse(request.query); const r = workspaces.list(q); return ok(r.items, { total: r.total, page: r.page, pageSize: r.pageSize }); });
  app.post('/api/v1/organizations/:id/workspaces', async (request, reply) => { await requirePermission(request,'workspaces:write'); const organizationId = idParams.parse(request.params).id; if(!orgs.get(organizationId)) throw new NotFoundAppError('organization'); const i = workspaceSchema.parse(request.body); if(i.projectId && !projects.get(i.projectId)) throw new NotFoundAppError('project'); const slug = i.slug ?? slugify(i.name); return reply.code(201).send(created(workspaces.put({ id: crypto.randomUUID(), organizationId, ...(i.projectId ? { projectId: i.projectId } : {}), name: i.name, slug, environment: i.environment, createdAt: now(), updatedAt: now() }))); });
  app.get('/api/v1/workspaces/:id', async (request) => { await requirePermission(request,'workspaces:read'); const w = workspaces.get(idParams.parse(request.params).id); if(!w) throw new NotFoundAppError('workspace'); return ok(w); });
  return app;
};
if (process.argv[1]?.endsWith('index.js')) { const config = loadConfig(); const server = await buildServer(); await server.listen({ host: config.api.host, port: config.api.port }); }
