import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { z } from 'zod';
import { loadConfig } from '@irp/config';
import {
  ConflictAppError,
  ForbiddenAppError,
  NotFoundAppError,
  UnauthorizedAppError,
  ValidationAppError,
  createDomainEvent,
  mapErrorToHttp,
} from '@irp/core';
import { createLogger } from '@irp/logger';
import {
  createHealthStatus,
  httpRequestDuration,
  networkHealthScore,
  networkLatencyMs,
  probeFailureTotal,
  probeSuccessTotal,
  renderPrometheusMetrics,
} from '@irp/telemetry';
import { NetworkMonitoringService, type NetworkProbe } from '@irp/network';
import {
  JwtAuthenticationProvider,
  JwtService,
  RbacAuthorization,
  hashPassword,
  verifyPassword,
  type Principal,
} from '@irp/auth';
import { InMemoryEventBus } from '@irp/events';
import { MemoryQueue } from '@irp/queue';
import { checkDatabaseHealth, createPrismaClient } from '@irp/database';
import {
  ResilienceRuntime,
  NetworkAutopilot,
  createAutopilotPolicy,
  runtimeEnvelope,
} from '@irp/resilience-runtime';

type Entity = { id: string; createdAt: string; updatedAt: string; deletedAt?: string | null };
type User = Entity & {
  email: string;
  name: string;
  passwordHash: string;
  status: 'pending' | 'active' | 'suspended';
  emailVerifiedAt?: string;
  roles: string[];
  permissions: string[];
};
type Organization = Entity & { name: string; slug: string };
type Project = Entity & {
  organizationId: string;
  name: string;
  slug: string;
  description?: string;
};
type Workspace = Entity & {
  organizationId: string;
  projectId?: string;
  name: string;
  slug: string;
  environment: string;
};
type NetworkSnapshot = Awaited<ReturnType<NetworkMonitoringService['runOnce']>>;
type NetworkMeasurement = NetworkSnapshot['measurements'][number];
type Session = {
  id: string;
  userId: string;
  refreshToken: string;
  expiresAt: string;
  revokedAt?: string;
};
const now = () => new Date().toISOString();
const slugify = (v: string) =>
  v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
const ok = <T>(data: T, meta?: unknown) => ({ success: true, data, ...(meta ? { meta } : {}) });
const created = <T extends Entity>(data: T) => ok(data);
const publicUser = (user: User) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  status: user.status,
  emailVerifiedAt: user.emailVerifiedAt ?? null,
  roles: user.roles,
  permissions: user.permissions,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
});
const password = z.string().min(12).max(256).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/);
const registerSchema = z.object({
  email: z.string().email().toLowerCase(),
  name: z.string().min(1).max(120),
  password,
});
const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});
const nameSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(80).optional(),
  description: z.string().max(1000).optional(),
});
const workspaceSchema = nameSchema.extend({
  projectId: z.string().uuid().optional(),
  environment: z.enum(['development', 'staging', 'production']).default('production'),
});
const runtimeCycleSchema = z.object({
  mode: z.enum(['simulation', 'safe', 'live']).default('simulation'),
});
const idParams = z.object({ id: z.string().uuid() });
class Store<T extends Entity> {
  private readonly rows = new Map<string, T>();
  list(query: z.infer<typeof paginationSchema>, filter: (item: T) => boolean = () => true) {
    const items = [...this.rows.values()]
      .filter((i) => !i.deletedAt)
      .filter(filter)
      .sort((a, b) =>
        query.order === 'asc'
          ? String(a[query.sort as keyof T] ?? '').localeCompare(
              String(b[query.sort as keyof T] ?? ''),
            )
          : String(b[query.sort as keyof T] ?? '').localeCompare(
              String(a[query.sort as keyof T] ?? ''),
            ),
      );
    const start = (query.page - 1) * query.pageSize;
    return {
      items: items.slice(start, start + query.pageSize),
      total: items.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
  get(id: string) {
    const item = this.rows.get(id);
    return item && !item.deletedAt ? item : null;
  }
  put(row: T) {
    this.rows.set(row.id, row);
    return row;
  }
  find(fn: (item: T) => boolean) {
    return [...this.rows.values()].find((i) => !i.deletedAt && fn(i)) ?? null;
  }
  softDelete(id: string) {
    const row = this.get(id);
    if (!row) throw new NotFoundAppError('resource');
    row.deletedAt = now();
    row.updatedAt = now();
  }
}
const users = new Store<User>();
const orgs = new Store<Organization>();
const projects = new Store<Project>();
const workspaces = new Store<Workspace>();
const sessions = new Map<string, Session>();
const isProductionRuntime = () =>
  ['production', 'staging'].includes((process.env.NODE_ENV ?? '').toLowerCase());
const resolveJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (isProductionRuntime())
    throw new Error('JWT_SECRET is required for production or staging API runtime.');
  return 'development-secret-development-secret-32';
};
const permissions = [
  'users:read',
  'users:write',
  'organizations:read',
  'organizations:write',
  'projects:read',
  'projects:write',
  'workspaces:read',
  'workspaces:write',
  'runtime.read',
  'runtime.inspect',
  'runtime.simulate',
  'runtime.execute',
  'runtime.recover',
  'runtime.admin',
  'autopilot.read',
  'autopilot.execute',
  'autopilot.approve',
  'autopilot.admin',
];
const requireAuth = async (request: FastifyRequest): Promise<Principal> => {
  const principal = await request.jwtAuth.authenticate({ headers: request.headers });
  if (!principal) throw new UnauthorizedAppError();
  return principal;
};
const requirePermission = async (request: FastifyRequest, permission: string) => {
  const principal = await requireAuth(request);
  if (
    !(await request.rbac.authorize({
      principal,
      resource: request.url,
      action: request.method,
      requiredPermissions: [permission],
    }))
  )
    throw new ForbiddenAppError();
  return principal;
};
declare module 'fastify' {
  interface FastifyRequest {
    jwtAuth: JwtAuthenticationProvider;
    rbac: RbacAuthorization;
  }
}
export const buildServer = async (): Promise<FastifyInstance> => {
  const config = loadConfig();
  const logger = createLogger({ level: config.logger.level, pretty: false, service: 'irp-api' });
  const testProbe: NetworkProbe = {
    name: 'test-dns',
    type: 'dns',
    config: {},
    async execute() {
      return {
        name: 'test-dns',
        probeType: 'dns',
        success: true,
        latencyMs: 1,
        timestamp: new Date().toISOString(),
        metadata: { environment: 'test' },
      };
    },
  };
  const networkMonitor =
    process.env.NODE_ENV === 'test'
      ? new NetworkMonitoringService([testProbe], undefined, 60_000, 0)
      : new NetworkMonitoringService();
  const app = Fastify({
    logger: false,
    genReqId: (request) => request.headers['x-request-id']?.toString() ?? crypto.randomUUID(),
  });
  const jwt = new JwtService(resolveJwtSecret(), 'irp');
  const jwtAuth = new JwtAuthenticationProvider(jwt);
  const rbac = new RbacAuthorization();
  const events = new InMemoryEventBus();
  const queue = new MemoryQueue();
  const db = createPrismaClient(process.env.DATABASE_URL);
  app.decorateRequest('jwtAuth', undefined as unknown as JwtAuthenticationProvider);
  app.decorateRequest('rbac', undefined as unknown as RbacAuthorization);
  app.setErrorHandler((error, _request, reply) => {
    const mapped =
      error instanceof z.ZodError
        ? mapErrorToHttp(new ValidationAppError('Invalid request', { issues: error.issues }))
        : mapErrorToHttp(error);
    reply.status(mapped.statusCode).send(mapped.body);
  });
  app.addHook('onRequest', async (request) => {
    request.jwtAuth = jwtAuth;
    request.rbac = rbac;
    request.headers['x-correlation-id'] = request.headers['x-correlation-id'] ?? request.id;
  });
  app.addHook('onResponse', async (request, reply) => {
    httpRequestDuration.observe(
      {
        method: request.method,
        route: request.routeOptions.url ?? request.url,
        status_code: String(reply.statusCode),
      },
      reply.elapsedTime / 1000,
    );
    logger.info('request completed', {
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
    });
  });
  await app.register(cors);
  await app.register(helmet);
  await app.register(swagger, {
    openapi: {
      info: { title: 'InternetResiliencePlatform API', version: config.app.version },
      servers: [{ url: '/api/v1' }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  app.get('/api/v1/health', async () => ok(createHealthStatus({ api: 'healthy' })));
  app.get('/api/v1/ready', async (_request, reply) => {
    let database: 'healthy' | 'degraded' = 'healthy';
    try {
      await checkDatabaseHealth(db);
    } catch {
      database = 'degraded';
    }
    const health = createHealthStatus({
      api: 'healthy',
      database,
      queue: queue.size() >= 0 ? 'healthy' : 'unhealthy',
    });
    if (database !== 'healthy') reply.status(503);
    return ok(health);
  });
  app.get('/api/v1/live', async () => ok(createHealthStatus({ process: 'healthy' })));
  app.get('/api/v1/version', async () =>
    ok({ name: config.app.name, version: config.app.version, environment: config.app.environment }),
  );
  app.get('/api/v1/metrics', async (_r, reply) =>
    reply.type('text/plain').send(await renderPrometheusMetrics()),
  );
  const recordNetworkTelemetry = (
    snapshot: Awaited<ReturnType<NetworkMonitoringService['runOnce']>>,
  ) => {
    networkHealthScore.set(snapshot.score.score);
    for (const measurement of snapshot.measurements) {
      const labels = {
        probe_type: measurement.probeType,
        probe_name: String(measurement.metadata['probeName'] ?? measurement.probeType),
      };
      if (measurement.success) probeSuccessTotal.inc(labels);
      else probeFailureTotal.inc(labels);
      if (typeof measurement.latency === 'number')
        networkLatencyMs.observe(labels, measurement.latency);
    }
  };
  const getNetworkSnapshot = async () => {
    if (networkMonitor.measurements().length === 0) {
      const snapshot = await networkMonitor.runOnce();
      recordNetworkTelemetry(snapshot);
      return snapshot;
    }
    return networkMonitor.snapshot();
  };
  app.get('/api/v1/health/network', async () => ok(await getNetworkSnapshot()));

  const summarizePlatformStatus = async () => {
    const snapshot = await getNetworkSnapshot();
    const latestDns = snapshot.measurements.find((m: NetworkMeasurement) => m.probeType === 'dns');
    const latestProvider = snapshot.measurements.find(
      (m: NetworkMeasurement) => m.probeType === 'provider',
    );
    const latestInterfaces = snapshot.measurements.filter(
      (m: NetworkMeasurement) => m.probeType === 'ip',
    );
    const networkStatus =
      snapshot.status === 'healthy'
        ? 'connected'
        : snapshot.status === 'degraded'
          ? 'degraded'
          : 'disconnected';
    const statusLevel =
      snapshot.status === 'healthy'
        ? 'healthy'
        : snapshot.status === 'degraded'
          ? 'degraded'
          : 'unavailable';
    const updatedAt = snapshot.score.timestamp;
    return {
      source: 'LIVE',
      updatedAt,
      network: {
        source: 'LIVE',
        connection: networkStatus,
        currentRoute: String(latestProvider?.metadata['provider'] ?? 'system-default'),
        interfaces: latestInterfaces.map((m: NetworkMeasurement) => ({
          name: String(m.metadata['probeName'] ?? m.probeType),
          state: m.success ? 'up' : 'degraded',
          latencyMs: m.latency ?? undefined,
        })),
        health: statusLevel,
        updatedAt,
      },
      dns: {
        source: 'LIVE',
        resolver: String(
          latestDns?.metadata['hostname'] ?? latestDns?.metadata['probeName'] ?? 'system',
        ),
        secureTransport: 'NOT_IMPLEMENTED',
        health: latestDns?.success ? 'healthy' : 'unavailable',
        latencyMs: latestDns?.latency ?? undefined,
        policyStatus: 'observe-only',
        leakStatus: 'unavailable',
      },
      routing: {
        source: 'LIVE',
        status: 'PARTIAL',
        mode: 'observe-only',
        currentRoute: 'system-default',
      },
      recovery: {
        source: 'LIVE',
        status: snapshot.issues.length ? 'degraded' : 'healthy',
        issues: snapshot.issues,
      },
      tunnel: { source: 'LIVE', activeTunnel: null, tunnels: [] },
      security: {
        source: 'LIVE',
        state: snapshot.status === 'unhealthy' ? 'degraded' : 'healthy',
        protectionState: 'observe-only',
        killSwitch: 'not-configured',
        violations: snapshot.issues,
        routeLeak: 'unavailable',
        dnsLeak: 'unavailable',
        ipv6: 'observed',
        explanation:
          'Live backend status is derived from safe network probes; host enforcement remains observe-only.',
      },
      autopilot: {
        source: 'LIVE',
        enabled: false,
        mode: 'OBSERVE_ONLY',
        circuitBreaker: 'CLOSED',
        activeIncidents: snapshot.issues.length ? 1 : 0,
        pendingApprovals: snapshot.issues.length ? 1 : 0,
        activeActions: 0,
        verificationState: 'UNKNOWN',
        rollbackState: 'NOT_REQUIRED',
        recentOutcomes: snapshot.issues.length ? ['ADVISORY'] : ['NOOP'],
      },
      decision: {
        source: 'LIVE',
        recommendation:
          snapshot.status === 'healthy'
            ? 'maintain-current-route'
            : 'investigate-degraded-connectivity',
        score: snapshot.score.score,
        confidence: snapshot.measurements.length ? 0.75 : 0,
        mode: 'deterministic',
        explanation: 'Deterministic recommendation derived from live backend network health score.',
        candidates: snapshot.measurements.map((m: NetworkMeasurement) => ({
          name: m.probeType,
          score: m.success ? 100 : 0,
          accepted: m.success,
          reason: m.error ?? 'probe succeeded',
        })),
        policyValidation: 'observe-only',
        securityValidation: snapshot.issues.length ? 'review-required' : 'passed',
        decisionAgeSeconds: Math.max(0, Math.round((Date.now() - Date.parse(updatedAt)) / 1000)),
      },
      eventBus: { source: 'LIVE', scope: 'in-process', status: 'healthy' },
      observability: { source: 'LIVE', metrics: 'available', health: snapshot.status },
    };
  };
  app.get('/api/v1/platform/status', async () => {
    const status = await summarizePlatformStatus();
    let database: 'healthy' | 'degraded' = 'healthy';
    try {
      await checkDatabaseHealth(db);
    } catch {
      database = 'degraded';
    }
    return ok({
      ...status,
      dependencies: {
        database,
        queue: queue.size() >= 0 ? 'healthy' : 'unhealthy',
      },
    });
  });

  app.get('/api/v1/platform/metrics/stream', async (_request, reply) => {
    const snapshot = await getNetworkSnapshot();
    const metrics = snapshot.measurements.map((measurement: NetworkMeasurement) => ({
      timestamp: measurement.timestamp,
      probeType: measurement.probeType,
      latencyMs: measurement.latency,
      success: measurement.success,
      packetLossPct:
        measurement.probeType === 'packet_loss' &&
        typeof measurement.metadata['lossRatio'] === 'number'
          ? Number(measurement.metadata['lossRatio']) * 100
          : undefined,
      dnsPerformanceMs: measurement.probeType === 'dns' ? measurement.latency : undefined,
    }));
    reply.header('cache-control', 'no-cache, no-transform');
    reply.header('connection', 'keep-alive');
    reply.header('x-accel-buffering', 'no');
    return reply.type('text/event-stream').send(
      `retry: 10000
event: platform.metrics
data: ${JSON.stringify({ source: 'LIVE', updatedAt: snapshot.score.timestamp, metrics })}

`,
    );
  });
  const resilienceRuntime = new ResilienceRuntime();
  const runtimeResponse = <T>(request: FastifyRequest, data: T) =>
    runtimeEnvelope(data, request.headers['x-correlation-id']?.toString() ?? request.id);

  const autopilot = new NetworkAutopilot(
    [],
    createAutopilotPolicy({
      enabled: process.env.AUTOPILOT_ENABLED === 'true',
      mode:
        (process.env.AUTOPILOT_MODE as
          ReturnType<typeof createAutopilotPolicy>['mode'] | undefined) ?? 'OBSERVE_ONLY',
    }),
  );
  app.get('/api/v1/autopilot/status', async (request) => {
    await requirePermission(request, 'autopilot.read');
    return runtimeResponse(request, autopilot.status());
  });
  app.get('/api/v1/autopilot/runs', async (request) => {
    await requirePermission(request, 'autopilot.read');
    return runtimeResponse(request, autopilot.listRuns());
  });
  app.get('/api/v1/autopilot/runs/:id', async (request) => {
    await requirePermission(request, 'autopilot.read');
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const run = autopilot.getRun(params.id);
    if (!run) throw new NotFoundAppError('autopilot run');
    return runtimeResponse(request, run);
  });
  app.post('/api/v1/autopilot/runs', async (request) => {
    await requirePermission(request, 'autopilot.execute');
    const body = z
      .object({
        dryRun: z.boolean().default(false),
        shadow: z.boolean().default(false),
        forceVerificationFailure: z.boolean().default(false),
      })
      .parse(request.body ?? {});
    return runtimeResponse(request, await autopilot.run(body));
  });
  app.post('/api/v1/autopilot/runs/:id/cancel', async (request) => {
    await requirePermission(request, 'autopilot.admin');
    return runtimeResponse(request, {
      id: z.object({ id: z.string() }).parse(request.params).id,
      status: 'cancel-requested',
    });
  });
  app.post('/api/v1/autopilot/actions/:id/approve', async (request) => {
    await requirePermission(request, 'autopilot.approve');
    return runtimeResponse(request, {
      actionId: z.object({ id: z.string() }).parse(request.params).id,
      status: 'approved',
    });
  });
  app.post('/api/v1/autopilot/actions/:id/reject', async (request) => {
    await requirePermission(request, 'autopilot.approve');
    return runtimeResponse(request, {
      actionId: z.object({ id: z.string() }).parse(request.params).id,
      status: 'rejected',
    });
  });
  app.post('/api/v1/autopilot/actions/:id/rollback', async (request) => {
    await requirePermission(request, 'autopilot.admin');
    return runtimeResponse(request, {
      actionId: z.object({ id: z.string() }).parse(request.params).id,
      status: 'rollback-requested',
    });
  });
  app.get('/api/v1/autopilot/policies', async (request) => {
    await requirePermission(request, 'autopilot.read');
    return runtimeResponse(request, autopilot.policies());
  });
  app.get('/api/v1/autopilot/actions', async (request) => {
    await requirePermission(request, 'autopilot.read');
    return runtimeResponse(request, autopilot.actions());
  });
  app.get('/api/v1/autopilot/health', async (request) => {
    await requirePermission(request, 'autopilot.read');
    return runtimeResponse(request, {
      status: autopilot.status().circuitBreaker === 'OPEN' ? 'degraded' : 'healthy',
      autopilot: autopilot.status(),
    });
  });
  app.get('/api/v1/autopilot/circuit-breaker', async (request) => {
    await requirePermission(request, 'autopilot.read');
    return runtimeResponse(request, { state: autopilot.status().circuitBreaker });
  });
  app.post('/api/v1/autopilot/circuit-breaker/reset', async (request) => {
    await requirePermission(request, 'autopilot.admin');
    autopilot.resetCircuitBreaker();
    return runtimeResponse(request, { state: autopilot.status().circuitBreaker });
  });

  app.get('/api/v1/runtime/status', async (request) => {
    await requirePermission(request, 'runtime.read');
    const snapshot = await resilienceRuntime.getRuntimeSnapshot();
    return runtimeResponse(request, {
      runtimeId: resilienceRuntime.runtimeId,
      instanceId: resilienceRuntime.instanceId,
      state: snapshot.state,
      mode: snapshot.mode,
      health: snapshot.health,
      uptimeMs: snapshot.uptimeMs,
    });
  });
  app.get('/api/v1/runtime/snapshot', async (request) => {
    await requirePermission(request, 'runtime.inspect');
    return runtimeResponse(request, {
      ...(await resilienceRuntime.getRuntimeSnapshot()),
      runtimeId: resilienceRuntime.runtimeId,
      instanceId: resilienceRuntime.instanceId,
    });
  });
  app.get('/api/v1/runtime/decisions', async (request) => {
    await requirePermission(request, 'runtime.read');
    return runtimeResponse(request, await resilienceRuntime.decisions.list());
  });
  app.get('/api/v1/runtime/incidents', async (request) => {
    await requirePermission(request, 'runtime.read');
    return runtimeResponse(request, await resilienceRuntime.incidents.list());
  });
  app.get('/api/v1/runtime/policies', async (request) => {
    await requirePermission(request, 'runtime.inspect');
    return runtimeResponse(request, (await resilienceRuntime.getRuntimeSnapshot()).policySnapshot);
  });
  app.get('/api/v1/runtime/capabilities', async (request) => {
    await requirePermission(request, 'runtime.inspect');
    return runtimeResponse(request, resilienceRuntime.capabilities());
  });
  app.post('/api/v1/runtime/cycle', async (request, reply) => {
    const input = runtimeCycleSchema.parse(request.body ?? {});
    const required = input.mode === 'live' ? 'runtime.execute' : 'runtime.simulate';
    await requirePermission(request, required);
    if (input.mode !== 'simulation' && !request.headers['idempotency-key']) {
      reply.status(409);
      return runtimeResponse(request, { code: 'IDEMPOTENCY_KEY_REQUIRED', retryable: true });
    }
    if (input.mode === 'live') {
      reply.status(403);
      return runtimeResponse(request, { code: 'LIVE_MODE_DISABLED', retryable: false });
    }
    return runtimeResponse(
      request,
      await resilienceRuntime.runCycle({
        mode: input.mode,
        ...(request.headers['idempotency-key']
          ? { idempotencyKey: request.headers['idempotency-key'].toString() }
          : {}),
      }),
    );
  });

  app.get('/api/v1/metrics/network', async () =>
    ok({
      latest: networkMonitor.snapshot().score,
      measurements: networkMonitor.measurements().length,
    }),
  );
  app.get('/api/v1/measurements', async (request) => {
    const q = paginationSchema.parse(request.query);
    const rows = networkMonitor
      .measurements()
      .slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    return ok(rows, {
      total: networkMonitor.measurements().length,
      page: q.page,
      pageSize: q.pageSize,
    });
  });
  app.post('/api/v1/probes/run', async () => {
    const snapshot = await networkMonitor.runOnce();
    recordNetworkTelemetry(snapshot);
    logger.info('network probes completed', {
      status: snapshot.status,
      score: snapshot.score.score,
      issues: snapshot.issues,
    });
    return ok(snapshot);
  });

  app.post('/api/v1/auth/register', async (request, reply) => {
    const input = registerSchema.parse(request.body);
    if (users.find((u) => u.email === input.email))
      throw new ConflictAppError('Email is already registered.');
    const user = users.put({
      id: crypto.randomUUID(),
      email: input.email,
      name: input.name,
      passwordHash: hashPassword(input.password),
      status: 'active',
      roles: ['platform_admin'],
      permissions,
      createdAt: now(),
      updatedAt: now(),
    });
    await events.publish(createDomainEvent('user.registered', user.id, { email: user.email }));
    return reply.code(201).send(created(publicUser(user) as never));
  });
  app.post('/api/v1/auth/login', async (request) => {
    const input = loginSchema.parse(request.body);
    const user = users.find((u) => u.email === input.email);
    if (!user || !verifyPassword(input.password, user.passwordHash))
      throw new UnauthorizedAppError('Invalid credentials');
    const session: Session = {
      id: crypto.randomUUID(),
      userId: user.id,
      refreshToken: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
    };
    sessions.set(session.id, session);
    const accessToken = jwt.sign({
      sub: user.id,
      roles: user.roles,
      scopes: user.permissions,
      sessionId: session.id,
      type: 'access',
      ttlSeconds: 900,
    });
    const refreshToken = jwt.sign({
      sub: user.id,
      roles: user.roles,
      scopes: user.permissions,
      sessionId: session.id,
      type: 'refresh',
      ttlSeconds: 30 * 86400,
    });
    return ok({ accessToken, refreshToken, expiresIn: 900, user: publicUser(user) });
  });
  app.post('/api/v1/auth/refresh', async (request) => {
    const token = z.object({ refreshToken: z.string() }).parse(request.body).refreshToken;
    const claims = jwt.verify(token, 'refresh');
    const user = users.get(claims.sub);
    if (!user || !claims.sessionId || !sessions.has(claims.sessionId))
      throw new UnauthorizedAppError();
    return ok({
      accessToken: jwt.sign({
        sub: user.id,
        roles: user.roles,
        scopes: user.permissions,
        sessionId: claims.sessionId,
        type: 'access',
        ttlSeconds: 900,
      }),
      expiresIn: 900,
    });
  });
  app.post('/api/v1/auth/logout', async (request) => {
    const p = await requireAuth(request);
    const sid = String(p.metadata?.sessionId ?? '');
    const s = sessions.get(sid);
    if (s) s.revokedAt = now();
    return ok({ loggedOut: true });
  });
  app.post('/api/v1/auth/password-reset/request', async (request) => {
    z.object({ email: z.string().email() }).parse(request.body);
    return ok({ accepted: true });
  });
  app.post('/api/v1/auth/email-verification/request', async (request) => {
    await requireAuth(request);
    return ok({ accepted: true });
  });
  const listUsers = async (request: FastifyRequest) => {
    await requirePermission(request, 'users:read');
    const q = paginationSchema.parse(request.query);
    const result = users.list(
      q,
      (u) => !q.search || u.email.includes(q.search) || u.name.includes(q.search),
    );
    return ok(result.items.map(publicUser), {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  };
  app.get('/api/v1/users', listUsers);
  app.get('/api/v1/users/:id', async (request) => {
    await requirePermission(request, 'users:read');
    const user = users.get(idParams.parse(request.params).id);
    if (!user) throw new NotFoundAppError('user');
    return ok(publicUser(user));
  });
  app.get('/api/v1/me', async (request) => {
    const p = await requireAuth(request);
    const user = users.get(p.id);
    if (!user) throw new NotFoundAppError('user');
    return ok(publicUser(user));
  });
  app.get('/api/v1/organizations', async (request) => {
    await requirePermission(request, 'organizations:read');
    const q = paginationSchema.parse(request.query);
    const r = orgs.list(q, (o) => !q.search || o.name.includes(q.search));
    return ok(r.items, { total: r.total, page: r.page, pageSize: r.pageSize });
  });
  app.post('/api/v1/organizations', async (request, reply) => {
    await requirePermission(request, 'organizations:write');
    const i = nameSchema.parse(request.body);
    const slug = i.slug ?? slugify(i.name);
    if (orgs.find((o) => o.slug === slug))
      throw new ConflictAppError('Organization slug already exists.');
    return reply.code(201).send(
      created(
        orgs.put({
          id: crypto.randomUUID(),
          name: i.name,
          slug,
          createdAt: now(),
          updatedAt: now(),
        }),
      ),
    );
  });
  app.get('/api/v1/organizations/:id', async (request) => {
    await requirePermission(request, 'organizations:read');
    const o = orgs.get(idParams.parse(request.params).id);
    if (!o) throw new NotFoundAppError('organization');
    return ok(o);
  });
  app.delete('/api/v1/organizations/:id', async (request) => {
    await requirePermission(request, 'organizations:write');
    orgs.softDelete(idParams.parse(request.params).id);
    return ok({ deleted: true });
  });
  app.get('/api/v1/projects', async (request) => {
    await requirePermission(request, 'projects:read');
    const q = paginationSchema.parse(request.query);
    const r = projects.list(q);
    return ok(r.items, { total: r.total, page: r.page, pageSize: r.pageSize });
  });
  app.post('/api/v1/organizations/:id/projects', async (request, reply) => {
    await requirePermission(request, 'projects:write');
    const organizationId = idParams.parse(request.params).id;
    if (!orgs.get(organizationId)) throw new NotFoundAppError('organization');
    const i = nameSchema.parse(request.body);
    const slug = i.slug ?? slugify(i.name);
    return reply.code(201).send(
      created(
        projects.put({
          id: crypto.randomUUID(),
          organizationId,
          name: i.name,
          slug,
          ...(i.description ? { description: i.description } : {}),
          createdAt: now(),
          updatedAt: now(),
        }),
      ),
    );
  });
  app.get('/api/v1/projects/:id', async (request) => {
    await requirePermission(request, 'projects:read');
    const p = projects.get(idParams.parse(request.params).id);
    if (!p) throw new NotFoundAppError('project');
    return ok(p);
  });
  app.get('/api/v1/workspaces', async (request) => {
    await requirePermission(request, 'workspaces:read');
    const q = paginationSchema.parse(request.query);
    const r = workspaces.list(q);
    return ok(r.items, { total: r.total, page: r.page, pageSize: r.pageSize });
  });
  app.post('/api/v1/organizations/:id/workspaces', async (request, reply) => {
    await requirePermission(request, 'workspaces:write');
    const organizationId = idParams.parse(request.params).id;
    if (!orgs.get(organizationId)) throw new NotFoundAppError('organization');
    const i = workspaceSchema.parse(request.body);
    if (i.projectId && !projects.get(i.projectId)) throw new NotFoundAppError('project');
    const slug = i.slug ?? slugify(i.name);
    return reply.code(201).send(
      created(
        workspaces.put({
          id: crypto.randomUUID(),
          organizationId,
          ...(i.projectId ? { projectId: i.projectId } : {}),
          name: i.name,
          slug,
          environment: i.environment,
          createdAt: now(),
          updatedAt: now(),
        }),
      ),
    );
  });
  app.get('/api/v1/workspaces/:id', async (request) => {
    await requirePermission(request, 'workspaces:read');
    const w = workspaces.get(idParams.parse(request.params).id);
    if (!w) throw new NotFoundAppError('workspace');
    return ok(w);
  });
  app.addHook('onClose', async () => {
    await db.$disconnect();
  });
  return app;
};
if (process.argv[1]?.endsWith('index.js')) {
  const config = loadConfig();
  const server = await buildServer();
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  for (const signal of signals) {
    process.once(signal, () => {
      void server.close().finally(() => process.exit(0));
    });
  }
  await server.listen({ host: config.api.host, port: config.api.port });
}
