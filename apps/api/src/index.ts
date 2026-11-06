import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { registerRemoteClientRoutes } from './remote-client-api.js';
import { registerProbeFederationRoutes } from './probe-federation-api.js';
import { registerUnifiedProductRoutes } from './unified-product-api.js';
import { registerNotificationIncidentRoutes } from './notifications-api.js';
import { registerHistoryRoutes } from './history-api.js';
import { dashboardCss, dashboardHtml, dashboardScript } from './dashboard.js';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
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
  activeTraceContext,
  bootstrapOpenTelemetry,
  classifyError,
  createHealthStatus,
  httpActiveRequests,
  httpRequestDuration,
  httpRequestTotal,
  networkHealthScore,
  networkLatencyMs,
  probeFailureTotal,
  probeSuccessTotal,
  observeDependency,
  prometheusContentType,
  renderPrometheusMetrics,
  runWithSpan,
  statusClass,
  traceContextFromHeaders,
} from '@irp/telemetry';
import { NetworkMonitoringService, type NetworkProbe } from '@irp/network';
import { isZeroCostResource } from '@irp/connectivity';
import {
  JwtAuthenticationProvider,
  JwtService,
  RbacAuthorization,
  type Principal,
} from '@irp/auth';
import { InMemoryEventBus } from '@irp/events';
import { MemoryQueue } from '@irp/queue';
import { checkDatabaseHealth, createPrismaClient } from '@irp/database';
import { PostgresHistoricalMeasurementStore } from '@irp/historical-analysis';
import { AuthService } from './identity/auth-service.js';
import { resolveEmailSender, type EmailSender } from './identity/mailer.js';
import { resolveIdentityRepositories } from './identity/resolve.js';
import { DuplicateError, type IdentityRepositories, type TenantScope, type UserRecord } from './identity/types.js';
import {
  createCanonicalRuntime,
  explainDecision,
  negotiatePlatformCapabilities,
  runtimeEnvelope,
  type Observation,
  type ObservationProvider,
} from '@irp/resilience-runtime';
import { registerIntentRoutes } from './intent-api.js';
import { sharedRateLimitPreHandler } from './security/rate-limit.js';
import {
  generateSpeedInsightsScript,
  injectSpeedInsightsIntoHtml,
  initializeSpeedInsights,
  defaultSpeedInsightsConfig,
  type SpeedInsightsConfig,
} from './speed-insights.js';
import { injectAnalyticsIntoHtml, defaultAnalyticsConfig, trackServerEvent } from './analytics.js';

type Entity = { id: string; createdAt: string; updatedAt: string; deletedAt?: string | null };
type NetworkSnapshot = Awaited<ReturnType<NetworkMonitoringService['runOnce']>>;
type NetworkMeasurement = NetworkSnapshot['measurements'][number];

const ZERO_COST_MODE_KEY = 'zero-cost-personal-mode';
const now = () => new Date().toISOString();
const slugify = (v: string) =>
  v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
const ok = <T>(data: T, meta?: unknown) => ({ success: true, data, ...(meta ? { meta } : {}) });
const created = <T extends Entity>(data: T) => ok(data);
const publicUser = (user: UserRecord) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  status: user.status,
  emailVerifiedAt: user.emailVerifiedAt,
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
const isProductionRuntime = () =>
  ['production', 'staging'].includes((process.env.NODE_ENV ?? '').toLowerCase());
const resolveJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (isProductionRuntime())
    throw new Error('JWT_SECRET is required for production or staging API runtime.');
  return 'development-secret-development-secret-32';
};
const bootstrapAdminEmails = (): string[] =>
  (process.env.IRP_BOOTSTRAP_ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
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
    observabilityContext: { requestId: string; traceId?: string; spanId?: string };
  }
}
export interface BuildServerOptions {
  /** Inject repositories (tests). Production resolves PostgreSQL and fails closed without it. */
  identity?: IdentityRepositories;
  /** Inject an email sender (tests). Production requires IRP_EMAIL_WEBHOOK_URL. */
  mailer?: EmailSender;
}
export const buildServer = async (options: BuildServerOptions = {}): Promise<FastifyInstance> => {
  const config = loadConfig();
  const serviceName = config.telemetry.serviceName;
  const telemetryState = bootstrapOpenTelemetry({
    enabled: config.telemetry.enabled,
    serviceName,
    serviceVersion: config.app.version,
    environment: config.app.environment,
    ...(config.telemetry.otlpEndpoint ? { otlpEndpoint: config.telemetry.otlpEndpoint } : {}),
    sampleRatio: config.telemetry.sampleRatio,
    prometheus: config.telemetry.prometheus,
  });
  const logger = createLogger({
    level: config.logger.level,
    pretty: false,
    service: serviceName,
  }).child({
    environment: config.app.environment,
  });
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
  const authorizationToken = (request: FastifyRequest): string | null => {
    const raw = request.headers.authorization;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value?.startsWith('Bearer ') ? value.slice(7) : null;
  };
  const repos = options.identity ?? resolveIdentityRepositories();
  const mailer = options.mailer ?? resolveEmailSender();
  const baseJwtAuth = new JwtAuthenticationProvider(jwt);
  // Access tokens are only honoured while their session is live, so logout/reset/reuse-detection
  // revoke access immediately instead of after the 15-minute token lifetime.
  const jwtAuth: JwtAuthenticationProvider = Object.assign(Object.create(baseJwtAuth) as JwtAuthenticationProvider, {
    async authenticate(request: Parameters<JwtAuthenticationProvider['authenticate']>[0]) {
      const principal = await baseJwtAuth.authenticate(request);
      if (!principal) return null;
      const sid = principal.metadata?.sessionId;
      if (typeof sid !== 'string' || !(await repos.sessions.isActive(sid, new Date().toISOString()))) return null;
      return principal;
    },
  });
  const auth = new AuthService({
    repos, mailer, jwt, bootstrapAdminEmails, adminPermissions: permissions, publicBaseUrl: process.env.IRP_PUBLIC_BASE_URL,
  });
  const rbac = new RbacAuthorization();
  const events = new InMemoryEventBus();
  const queue = new MemoryQueue();
  const db = createPrismaClient(process.env.DATABASE_URL);
  app.decorateRequest('jwtAuth', undefined as unknown as JwtAuthenticationProvider);
  app.decorateRequest('rbac', undefined as unknown as RbacAuthorization);
  app.decorateRequest(
    'observabilityContext',
    undefined as unknown as { requestId: string; traceId?: string; spanId?: string },
  );
  app.setErrorHandler((error, _request, reply) => {
    const category = error instanceof z.ZodError ? 'validation' : classifyError(error);
    const mapped =
      error instanceof z.ZodError
        ? mapErrorToHttp(new ValidationAppError('Invalid request', { issues: error.issues }))
        : mapErrorToHttp(error);
    logger.error('request failed', {
      ..._request.observabilityContext,
      requestId: _request.id,
      component: 'api',
      operation: `${_request.method} ${_request.routeOptions.url ?? _request.url.split('?')[0]}`,
      status: mapped.statusCode,
      error: {
        type: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
        category,
      },
    });
    reply.status(mapped.statusCode).send(mapped.body);
  });
  const generalRateLimit = sharedRateLimitPreHandler(repos.rateLimits, { name: 'general', max: 100, windowMs: 60_000 });
  app.addHook('onRequest', async (request, reply) => {
    request.jwtAuth = jwtAuth;
    request.rbac = rbac;
    request.headers['x-correlation-id'] = request.headers['x-correlation-id'] ?? request.id;
    reply.header('x-request-id', request.id);
    reply.header('x-correlation-id', request.headers['x-correlation-id']);
    request.observabilityContext = {
      requestId: request.id,
      ...traceContextFromHeaders(request.headers),
    };
    const route = request.routeOptions.url ?? request.url.split('?')[0] ?? 'unmatched';
    httpActiveRequests.inc({ method: request.method, route });
  });
  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? request.url.split('?')[0] ?? 'unmatched';
    const sc = statusClass(reply.statusCode);
    httpActiveRequests.dec({ method: request.method, route });
    httpRequestTotal.inc({ method: request.method, route, status_class: sc });
    httpRequestDuration.observe(
      { method: request.method, route, status_code: String(reply.statusCode), status_class: sc },
      reply.elapsedTime / 1000,
    );
    logger.info('request completed', {
      ...request.observabilityContext,
      requestId: request.id,
      component: 'http',
      operation: `${request.method} ${route}`,
      duration: Math.round(reply.elapsedTime),
      status: reply.statusCode,
      method: request.method,
      route,
    });
  });
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  await app.register(cors, allowedOrigins.length > 0 ? { origin: allowedOrigins } : { origin: false });
  await app.register(helmet);
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'InternetResiliencePlatform API', version: config.app.version },
      servers: [{ url: '/' }],
    },
  });
  // @fastify/swagger-ui pulls @fastify/static, which has a CJS/ESM conflict
  // in Vercel's bundled Node runtime. Keep the docs UI available locally,
  // but do not load the optional plugin in serverless functions.
  if (process.env.VERCEL !== '1') {
    const swaggerUi = (await import('@fastify/swagger-ui')).default;
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }
  const serveDashboard = async (_request: FastifyRequest, reply: import('fastify').FastifyReply) =>
    reply.header('cache-control', 'no-store').type('text/html; charset=utf-8').send(dashboardHtml);
  app.get('/', serveDashboard);
  app.get('/dashboard', serveDashboard);
  app.get('/assets/dashboard.css', async (_request, reply) =>
    reply.header('cache-control', 'public, max-age=300').type('text/css; charset=utf-8').send(dashboardCss),
  );
  app.get('/assets/dashboard.js', async (_request, reply) =>
    reply.header('cache-control', 'public, max-age=300').type('application/javascript; charset=utf-8').send(dashboardScript),
  );

  // ── Web Control Center static assets ──────────────────────────────────
  // Served from apps/web/ so the UI ships with the API binary.
  const WEB_DIR = new URL('../web', import.meta.url).pathname;
  app.register(async (web) => {
    web.addHook('preHandler', sharedRateLimitPreHandler);

    web.get('/', async (_request, reply) =>
      reply.type('text/html; charset=utf-8').send(await readFile('/web/index.html')),
    );
    web.get('/style.css', async (_request, reply) =>
      reply.header('cache-control', 'public, max-age=300').type('text/css; charset=utf-8').send(await readFile('/web/style.css')),
    );
    web.get('/src/app.js', async (_request, reply) =>
      reply.header('cache-control', 'public, max-age=300').type('application/javascript; charset=utf-8').send(await readFile('/web/src/app.js')),
    );
  }, { prefix: '/web' });

  app.get('/api/v1/health', async () => ok(createHealthStatus({ api: 'healthy' })));
  app.get('/api/v1/ready', async (_request, reply) => {
    let database: 'healthy' | 'degraded' = 'healthy';
    let dbLatencyMs: number | undefined;
    try {
      const health = await observeDependency('postgresql', 'readiness', () =>
        (async () => { await repos.ping(); return checkDatabaseHealth(db); })(),
      );
      dbLatencyMs = health.latencyMs;
    } catch (error) {
      database = 'degraded';
      logger.warn('database readiness check failed', {
        component: 'database',
        operation: 'readiness',
        error: {
          type: error instanceof Error ? error.name : 'Error',
          message: error instanceof Error ? error.message : String(error),
          category: classifyError(error),
        },
      });
    }
    const health = createHealthStatus(
      {
        api: 'healthy',
        database,
        queue: queue.size() >= 0 ? 'healthy' : 'unhealthy',
      },
      {
        service: serviceName,
        version: config.app.version,
        environment: config.app.environment,
        telemetry: telemetryState,
        uptimeSeconds: Math.round(process.uptime()),
        ...(dbLatencyMs !== undefined ? { databaseLatencyMs: dbLatencyMs } : {}),
      },
    );
    if (database !== 'healthy') reply.status(503);
    return ok(health);
  });
  app.get('/api/v1/live', async () => ok(createHealthStatus({ process: 'healthy' })));
  app.get('/api/v1/version', async () =>
    ok({ name: config.app.name, version: config.app.version, environment: config.app.environment }),
  );
  app.get('/api/v1/metrics', async (_r, reply) =>
    reply.type(prometheusContentType()).send(await renderPrometheusMetrics()),
  );

  // Vercel Analytics & Speed Insights Example Endpoint
  // This demonstrates how Web Analytics and Speed Insights can be integrated if this API serves HTML
  // Note: These tools measure client-side metrics, so they're only useful for HTML responses
  app.get('/api/v1/speed-insights/example', async (_request, reply) => {
    const exampleHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vercel Analytics & Speed Insights Integration</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 800px;
      margin: 2rem auto;
      padding: 0 1rem;
      line-height: 1.6;
    }
    pre {
      background: #f4f4f4;
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
    }
    .note {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 1rem;
      margin: 1rem 0;
    }
    .success {
      background: #d4edda;
      border-left: 4px solid #28a745;
      padding: 1rem;
      margin: 1rem 0;
    }
  </style>
</head>
<body>
  <h1>Vercel Analytics & Speed Insights Integration</h1>
  <div class="success">
    <strong>✓ Active:</strong> This page has both Web Analytics and Speed Insights enabled.
    Open your browser's developer console to see debug information about tracked events.
  </div>
  <div class="note">
    <strong>Note:</strong> These integrations measure client-side metrics in the browser.
    For backend API monitoring, use OpenTelemetry and Prometheus metrics already configured in this project.
  </div>
  
  <h2>Web Analytics</h2>
  <p>Vercel Web Analytics tracks:</p>
  <ul>
    <li><strong>Page Views</strong> - Automatic tracking of page visits</li>
    <li><strong>Custom Events</strong> - Track user interactions (Pro/Enterprise plans)</li>
    <li><strong>Unique Visitors</strong> - User engagement metrics</li>
    <li><strong>Geographic Distribution</strong> - Where your users are located</li>
  </ul>
  <pre><code>// Client-side page view tracking (automatic):
import { injectAnalyticsIntoHtml } from './analytics.js';
const withAnalytics = injectAnalyticsIntoHtml(html);

// Server-side custom event tracking:
import { trackServerEvent } from './analytics.js';
await trackServerEvent('user_registered', { userId: '123' });</code></pre>

  <h2>Speed Insights</h2>
  <p>Vercel Speed Insights tracks real user performance metrics:</p>
  <ul>
    <li><strong>LCP</strong> (Largest Contentful Paint) - Loading performance</li>
    <li><strong>FID</strong> (First Input Delay) - Interactivity</li>
    <li><strong>CLS</strong> (Cumulative Layout Shift) - Visual stability</li>
    <li><strong>TTFB</strong> (Time to First Byte) - Server response time</li>
    <li><strong>FCP</strong> (First Contentful Paint) - Initial render</li>
  </ul>
  <pre><code>// For programmatic HTML injection:
import { injectSpeedInsightsIntoHtml } from './speed-insights.js';
const withInsights = injectSpeedInsightsIntoHtml(html, {
  sampleRate: 1.0,
  debug: true
});</code></pre>

  <h2>Backend API Monitoring</h2>
  <p>For monitoring this API's performance, use:</p>
  <ul>
    <li><strong>OpenTelemetry</strong> - Distributed tracing (already configured)</li>
    <li><strong>Prometheus Metrics</strong> - Available at <a href="/api/v1/metrics">/api/v1/metrics</a></li>
    <li><strong>Health Checks</strong> - Available at <a href="/api/v1/health">/api/v1/health</a></li>
    <li><strong>Server-Side Events</strong> - Custom event tracking via Vercel Analytics</li>
  </ul>
</body>
</html>`;

    // Inject Speed Insights and Web Analytics into the example page
    let htmlWithInsights = injectSpeedInsightsIntoHtml(exampleHtml, {
      ...defaultSpeedInsightsConfig,
      route: '/api/v1/speed-insights/example',
    });

    // Also inject Web Analytics for page view tracking
    htmlWithInsights = injectAnalyticsIntoHtml(htmlWithInsights, {
      ...defaultAnalyticsConfig,
    });

    return reply.type('text/html').send(htmlWithInsights);
  });

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
      observability: {
        source: 'LIVE',
        metrics: 'available',
        health: snapshot.status,
        telemetry: telemetryState,
      },
    };
  };
  app.get('/api/v1/platform/status', async () => {
    const status = await summarizePlatformStatus();
    let database: 'healthy' | 'degraded' = 'healthy';
    let dbLatencyMs: number | undefined;
    try {
      const health = await observeDependency('postgresql', 'readiness', () =>
        (async () => { await repos.ping(); return checkDatabaseHealth(db); })(),
      );
      dbLatencyMs = health.latencyMs;
    } catch (error) {
      database = 'degraded';
      logger.warn('database readiness check failed', {
        component: 'database',
        operation: 'readiness',
        error: {
          type: error instanceof Error ? error.name : 'Error',
          message: error instanceof Error ? error.message : String(error),
          category: classifyError(error),
        },
      });
    }
    return ok({
      ...status,
      dependencies: {
        database,
        queue: queue.size() >= 0 ? 'healthy' : 'unhealthy',
      },
      diagnostics: {
        ...(dbLatencyMs !== undefined ? { databaseLatencyMs: dbLatencyMs } : {}),
      },
    });
  });

  // ── Zero-cost personal mode ───────────────────────────────────────────
  // Personal mode operates without mandatory paid providers. Providers with
  // cost tier 'free' and no subscription requirement are eligible; providers
  // with tier 'paid' or 'unknown' are rejected. Unknown pricing is never
  // treated as free. The mode is persisted through the Prisma CacheEntry
  // table so it survives restarts.

  let zeroCostMode = false;

  async function getZeroCostMode(): Promise<boolean> {
    return zeroCostMode;
  }

  async function setZeroCostMode(enabled: boolean): Promise<void> {
    zeroCostMode = enabled;
  }

  app.get('/api/v1/platform/zero-cost', async () => {
    const enabled = await getZeroCostMode();
    const snapshot = await getNetworkSnapshot();
    const interfaces = snapshot.measurements.filter((m) => m.probeType === 'ip');

    // Use actual provider cost metadata from the connectivity layer.
    // Resources without cost metadata are treated as unknown (not free).
    const providers = interfaces.map((m) => {
      const cost = m.metadata?.cost as
        | { readonly tier: 'free' | 'paid' | 'unknown'; readonly monthlyUsd?: number; readonly requiresSubscription?: boolean }
        | undefined;
      const eligible = cost ? isZeroCostResource({ cost } as any) : false;
      return {
        id: String(m.metadata?.providerName ?? m.id),
        type: String(m.metadata?.providerType ?? 'unknown'),
        costTier: cost?.tier ?? 'unknown',
        monthlyUsd: cost?.monthlyUsd,
        requiresSubscription: cost?.requiresSubscription ?? false,
        eligible,
        healthy: m.success,
        latencyMs: m.latency,
      };
    });

    const eligibleProviders = providers.filter((p) => p.eligible).length;
    const rejectedPaidProviders = providers.filter(
      (p) => !p.eligible && (p.costTier === 'paid' || p.costTier === 'unknown'),
    ).length;

    // Current path cost: only report a real cost when we have actual metadata.
    // Never fabricate a zero cost for unknown-pricing providers.
    let currentPathCost: number | undefined;
    if (enabled && providers.length > 0) {
      const freeProviders = providers.filter((p) => p.eligible);
      if (freeProviders.length > 0) {
        currentPathCost = 0;
      }
    } else if (!enabled && providers.length > 0) {
      // Report the cost of the first non-free provider, or unknown
      const nonFree = providers.find((p) => p.costTier !== 'free');
      if (nonFree && nonFree.monthlyUsd !== undefined) {
        currentPathCost = nonFree.monthlyUsd;
      }
    }

    return ok({
      enabled,
      policy: 'zero-cost-personal',
      eligibleProviders,
      rejectedPaidProviders,
      providers,
      currentPathCost,
      notes:
        'Zero-cost personal mode only routes through providers with explicit ' +
        'zero-cost metadata. Providers with unknown or paid pricing are rejected. ' +
        'No provider is assumed free without explicit cost metadata.',
    });
  });

  app.post('/api/v1/platform/zero-cost/toggle', async (request, reply) => {
    await requirePermission(request, 'runtime.execute');
    const body = z.object({ enabled: z.boolean() }).parse(request.body ?? {});
    await setZeroCostMode(body.enabled);
    return ok({
      enabled: body.enabled,
      policy: 'zero-cost-personal',
      message: body.enabled
        ? 'Zero-cost personal mode enabled. Only explicitly zero-cost providers are used.'
        : 'Zero-cost personal mode disabled.',
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
  const runtimeObservationProvider: ObservationProvider = {
    id: 'api-network-monitor',
    async collect(context) {
      const snapshot = await networkMonitor.runOnce();
      const observations: Observation[] = snapshot.measurements.map((measurement) => {
        const healthy = measurement.success;
        return {
          id: `api-${measurement.probeType}-${context.correlationId}`,
          schemaVersion: 1,
          createdAt: measurement.timestamp,
          correlationId: context.correlationId,
          source: 'irp-api-network-monitor',
          metadata: measurement.metadata,
          category: 'network',
          metric: `${measurement.probeType}_health`,
          value: healthy ? (measurement.latency ?? 1) : null,
          timestamp: measurement.timestamp,
          freshnessMs: 0,
          confidence: healthy ? 0.9 : 0.8,
          severity: healthy ? 'info' : 'critical',
          status: healthy ? 'healthy' : 'failed',
        };
      });
      return {
        providerId: 'api-network-monitor',
        collectedAt: new Date().toISOString(),
        errors: [],
        observations,
      };
    },
  };
  const resilienceRuntime = createCanonicalRuntime({
    executionMode: 'simulation',
    observationProviders: [runtimeObservationProvider],
    runtimeId: 'api-runtime',
  }).runtime;
  const runtimeResponse = <T>(request: FastifyRequest, data: T) =>
    runtimeEnvelope(data, request.headers['x-correlation-id']?.toString() ?? request.id);

  registerIntentRoutes(app, {
    ...(process.env.DATABASE_URL ? { database: db } : {}),
    onActivated: async (intent) => {
      const result = await resilienceRuntime.runIntent(intent, {
        mode: 'simulation',
        correlationId: `intent-${intent.id}-v${intent.version}`,
        idempotencyKey: `intent-${intent.id}-v${intent.version}`,
      });
      // Log the intent execution result for audit trail
      console.log(
        JSON.stringify({
          level: 'info',
          msg: 'Intent executed via onActivated callback',
          intentId: intent.id,
          intentVersion: intent.version,
          decisionId: result.decisionId,
          status: result.outcome,
          correlationId: result.correlationId,
        }),
      );
    },
  });

  // The legacy /autopilot API remains a compatibility surface, but it must not
  // instantiate NetworkAutopilot: that class owns a historical, parallel
  // decision state machine. All live control-loop state is projected from the
  // canonical ResilienceRuntime below.
  const canonicalAutopilotStatus = async () => {
    const snapshot = await resilienceRuntime.getRuntimeSnapshot();
    return {
      source: 'resilience-runtime',
      mode: snapshot.mode,
      state: snapshot.state,
      health: snapshot.health,
      counters: snapshot.counters,
      deprecated: true,
    };
  };
  app.get('/api/v1/autopilot/status', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'autopilot.read');
    return runtimeResponse(request, await canonicalAutopilotStatus());
  });
  app.get('/api/v1/autopilot/runs', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'autopilot.read');
    return runtimeResponse(request, await resilienceRuntime.decisions.list());
  });
  app.get('/api/v1/autopilot/runs/:id', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'autopilot.read');
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const run = (await resilienceRuntime.decisions.list()).find(
      (decision) => decision.decisionId === params.id,
    );
    if (!run) throw new NotFoundAppError('autopilot run');
    return runtimeResponse(request, run);
  });
  app.post('/api/v1/autopilot/runs', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'autopilot.execute');
    const body = z
      .object({
        dryRun: z.boolean().default(false),
        shadow: z.boolean().default(false),
        forceVerificationFailure: z.boolean().default(false),
      })
      .parse(request.body ?? {});
    return runtimeResponse(
      request,
      await resilienceRuntime.runCycle({
        mode: 'simulation',
        correlationId: `api-autopilot-${request.id}`,
        idempotencyKey: `api-autopilot-${request.id}-${body.dryRun ? 'dry' : 'run'}-${body.shadow ? 'shadow' : 'active'}`,
      }),
    );
  });
  app.post('/api/v1/autopilot/runs/:id/cancel', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'autopilot.admin');
    const id = z.object({ id: z.string() }).parse(request.params).id;
    throw new ConflictAppError(
      `Autopilot run '${id}' cannot be cancelled through the legacy API; canonical runtime cycles are bounded and API cycles are synchronous simulations.`,
    );
  });
  app.post('/api/v1/autopilot/actions/:id/approve', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'autopilot.approve');
    const id = z.object({ id: z.string() }).parse(request.params).id;
    throw new ConflictAppError(
      `Autopilot action '${id}' cannot be approved through the legacy API; use a policy-governed runtime plan.`,
    );
  });
  app.post('/api/v1/autopilot/actions/:id/reject', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'autopilot.approve');
    const id = z.object({ id: z.string() }).parse(request.params).id;
    throw new ConflictAppError(
      `Autopilot action '${id}' cannot be rejected through the legacy API; use a policy-governed runtime plan.`,
    );
  });
  app.post('/api/v1/autopilot/actions/:id/rollback', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'autopilot.admin');
    const id = z.object({ id: z.string() }).parse(request.params).id;
    throw new ConflictAppError(
      `Autopilot action '${id}' cannot be rolled back through the legacy API; rollback is owned by the canonical transaction/recovery path.`,
    );
  });
  app.get('/api/v1/autopilot/policies', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'autopilot.read');
    return runtimeResponse(request, (await resilienceRuntime.getRuntimeSnapshot()).policySnapshot);
  });
  app.get('/api/v1/autopilot/actions', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'autopilot.read');
    return runtimeResponse(
      request,
      (await resilienceRuntime.decisions.list()).flatMap((decision) =>
        decision.selectedPlan ? [decision.selectedPlan.selectedAction] : [],
      ),
    );
  });
  app.get('/api/v1/autopilot/health', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'autopilot.read');
    const snapshot = await resilienceRuntime.getRuntimeSnapshot();
    return runtimeResponse(request, {
      status: snapshot.health.status === 'failed' ? 'degraded' : 'healthy',
      autopilot: {
        source: 'resilience-runtime',
        circuitBreaker: 'NOT_APPLICABLE',
        state: snapshot.state,
        health: snapshot.health,
        counters: snapshot.counters,
        deprecated: true,
      },
    });
  });
  app.get('/api/v1/autopilot/circuit-breaker', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'autopilot.read');
    return runtimeResponse(request, {
      state: 'NOT_APPLICABLE',
      reason:
        'canonical ResilienceRuntime uses validation locks and bounded cycles, not a legacy circuit breaker',
    });
  });
  app.post('/api/v1/autopilot/circuit-breaker/reset', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'autopilot.admin');
    return runtimeResponse(request, {
      state: 'NOT_APPLICABLE',
      reason: 'there is no legacy autopilot circuit breaker to reset',
    });
  });

  app.get('/api/v1/runtime/status', { preHandler: generalRateLimit }, async (request) => {
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
  app.get('/api/v1/runtime/snapshot', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'runtime.inspect');
    return runtimeResponse(request, {
      ...(await resilienceRuntime.getRuntimeSnapshot()),
      runtimeId: resilienceRuntime.runtimeId,
      instanceId: resilienceRuntime.instanceId,
    });
  });
  app.get('/api/v1/runtime/decisions', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'runtime.read');
    return runtimeResponse(request, await resilienceRuntime.decisions.list());
  });
  app.get('/api/v1/runtime/decisions/:id/explanation', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'runtime.read');
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const decision = (await resilienceRuntime.decisions.list()).find(
      (candidate) => candidate.decisionId === params.id,
    );
    if (!decision) throw new NotFoundAppError('runtime decision');
    return runtimeResponse(request, explainDecision(decision));
  });
  app.get('/api/v1/runtime/incidents', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'runtime.read');
    return runtimeResponse(request, await resilienceRuntime.incidents.list());
  });
  app.get('/api/v1/runtime/policies', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'runtime.inspect');
    return runtimeResponse(request, (await resilienceRuntime.getRuntimeSnapshot()).policySnapshot);
  });
  app.get('/api/v1/runtime/capabilities', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'runtime.inspect');
    return runtimeResponse(request, resilienceRuntime.capabilities());
  });
  // Read-only negotiation view. It reports which platform capabilities this
  // deployment actually supports; it never grants or performs an operation, so
  // exposing it does not make the API an execution authority.
  app.get('/api/v1/runtime/platform-capabilities', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'runtime.inspect');
    const rawQuery = (request.query ?? {}) as Readonly<Record<string, unknown>>;
    const requested = String(rawQuery['capabilities'] ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return runtimeResponse(
      request,
      negotiatePlatformCapabilities(
        // The API host runs the same negotiated contract as every other host.
        process.platform === 'darwin'
          ? 'macos'
          : process.platform === 'win32'
            ? 'windows'
            : process.platform === 'android'
              ? 'android'
              : 'linux',
        [...resilienceRuntime.capabilities().map((adapter) => adapter.adapterId), ...requested],
      ),
    );
  });
  app.post('/api/v1/runtime/cycle', { preHandler: generalRateLimit }, async (request, reply) => {
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
    const snapshot = await runWithSpan(
      'network.probes.run',
      { component: 'network', operation: 'probes.run' },
      async () => networkMonitor.runOnce(),
    );
    recordNetworkTelemetry(snapshot);
    logger.info('network probes completed', {
      ...activeTraceContext(),
      component: 'network',
      operation: 'probes.run',
      status: snapshot.status,
      score: snapshot.score.score,
      issues: snapshot.issues,
    });
    return ok(snapshot);
  });

  const ctxOf = (request: FastifyRequest) => ({ ip: request.ip, userAgent: request.headers['user-agent'] });
  const scopeOf = (principal: Principal): TenantScope =>
    principal.roles.includes('platform_admin') ? { kind: 'all' } : { kind: 'owner', userId: principal.id };
  const authRateLimit = sharedRateLimitPreHandler(repos.rateLimits, { name: 'auth', max: 10, windowMs: 60_000 });
  app.post('/api/v1/auth/register', { preHandler: authRateLimit }, async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const { user, emailDelivery } = await auth.register(input, ctxOf(request));
    await events.publish(createDomainEvent('user.registered', user.id, { email: user.email }));
    await trackServerEvent('user_registered', { status: user.status });
    return reply.code(201).send(created({ ...publicUser(user), emailDelivery } as never));
  });
  app.post('/api/v1/auth/email-verification/confirm', { preHandler: authRateLimit }, async (request) => {
    const { token } = z.object({ token: z.string().min(16).max(512) }).parse(request.body);
    return ok(publicUser(await auth.verifyEmail(token, ctxOf(request))));
  });
  app.post('/api/v1/auth/email-verification/request', { preHandler: authRateLimit }, async (request) => {
    const { email } = z.object({ email: z.string().email().toLowerCase() }).parse(request.body);
    await auth.requestEmailVerification(email, ctxOf(request));
    return ok({ accepted: true });
  });
  app.post('/api/v1/auth/login', { preHandler: authRateLimit }, async (request) => {
    const input = loginSchema.parse(request.body);
    const result = await auth.login(input.email, input.password, ctxOf(request));
    await trackServerEvent('user_login', { method: 'password' });
    return ok({ accessToken: result.accessToken, refreshToken: result.refreshToken, expiresIn: result.expiresIn, user: publicUser(result.user) });
  });
  app.post('/api/v1/auth/refresh', { preHandler: authRateLimit }, async (request) => {
    const { refreshToken } = z.object({ refreshToken: z.string().min(16).max(512) }).parse(request.body);
    return ok(await auth.refresh(refreshToken, ctxOf(request)));
  });
  app.post('/api/v1/auth/logout', { preHandler: generalRateLimit }, async (request) => {
    const p = await requireAuth(request);
    await auth.logout(String(p.metadata?.sessionId ?? ''), p.id, ctxOf(request));
    return ok({ loggedOut: true });
  });
  app.post('/api/v1/auth/password-reset/request', { preHandler: authRateLimit }, async (request) => {
    const { email } = z.object({ email: z.string().email().toLowerCase() }).parse(request.body);
    await auth.requestPasswordReset(email, ctxOf(request));
    return ok({ accepted: true });
  });
  app.post('/api/v1/auth/password-reset/confirm', { preHandler: authRateLimit }, async (request) => {
    const input = z.object({ token: z.string().min(16).max(512), password }).parse(request.body);
    await auth.confirmPasswordReset(input.token, input.password, ctxOf(request));
    return ok({ reset: true });
  });
  const listUsers = async (request: FastifyRequest) => {
    await requirePermission(request, 'users:read');
    const q = paginationSchema.parse(request.query);
    const result = await repos.users.list(q);
    return ok(result.items.map(publicUser), { total: result.total, page: result.page, pageSize: result.pageSize });
  };
  app.get('/api/v1/users', listUsers);
  app.get('/api/v1/users/:id', { preHandler: generalRateLimit }, async (request) => {
    await requirePermission(request, 'users:read');
    const user = await repos.users.findById(idParams.parse(request.params).id);
    if (!user) throw new NotFoundAppError('user');
    return ok(publicUser(user));
  });
  app.get('/api/v1/me', { preHandler: generalRateLimit }, async (request) => {
    const p = await requireAuth(request);
    const user = await repos.users.findById(p.id);
    if (!user) throw new NotFoundAppError('user');
    return ok(publicUser(user));
  });
  const conflictOnDuplicate = async <T>(fn: () => Promise<T>, message: string): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof DuplicateError) throw new ConflictAppError(message);
      throw e;
    }
  };
  app.get('/api/v1/organizations', { preHandler: generalRateLimit }, async (request) => {
    const p = await requirePermission(request, 'organizations:read');
    const r = await repos.organizations.list(paginationSchema.parse(request.query), scopeOf(p));
    return ok(r.items, { total: r.total, page: r.page, pageSize: r.pageSize });
  });
  app.post('/api/v1/organizations', { preHandler: generalRateLimit }, async (request, reply) => {
    const p = await requirePermission(request, 'organizations:write');
    const i = nameSchema.parse(request.body);
    const t = now();
    const org = await conflictOnDuplicate(
      () => repos.organizations.create({ id: crypto.randomUUID(), name: i.name, slug: i.slug ?? slugify(i.name), ownerUserId: p.id, createdAt: t, updatedAt: t, deletedAt: null }),
      'Organization slug already exists.',
    );
    return reply.code(201).send(created(org));
  });
  app.get('/api/v1/organizations/:id', { preHandler: generalRateLimit }, async (request) => {
    const p = await requirePermission(request, 'organizations:read');
    const o = await repos.organizations.findById(idParams.parse(request.params).id, scopeOf(p));
    if (!o) throw new NotFoundAppError('organization');
    return ok(o);
  });
  app.delete('/api/v1/organizations/:id', { preHandler: generalRateLimit }, async (request) => {
    const p = await requirePermission(request, 'organizations:write');
    if (!(await repos.organizations.softDelete(idParams.parse(request.params).id, scopeOf(p), now()))) throw new NotFoundAppError('resource');
    return ok({ deleted: true });
  });
  app.get('/api/v1/projects', { preHandler: generalRateLimit }, async (request) => {
    const p = await requirePermission(request, 'projects:read');
    const r = await repos.projects.list(paginationSchema.parse(request.query), scopeOf(p));
    return ok(r.items, { total: r.total, page: r.page, pageSize: r.pageSize });
  });
  app.post('/api/v1/organizations/:id/projects', { preHandler: generalRateLimit }, async (request, reply) => {
    const p = await requirePermission(request, 'projects:write');
    const organizationId = idParams.parse(request.params).id;
    if (!(await repos.organizations.findById(organizationId, scopeOf(p)))) throw new NotFoundAppError('organization');
    const i = nameSchema.parse(request.body);
    const t = now();
    const project = await conflictOnDuplicate(
      () => repos.projects.create({ id: crypto.randomUUID(), organizationId, name: i.name, slug: i.slug ?? slugify(i.name), ...(i.description ? { description: i.description } : {}), createdAt: t, updatedAt: t, deletedAt: null }),
      'Project slug already exists in this organization.',
    );
    return reply.code(201).send(created(project));
  });
  app.get('/api/v1/projects/:id', { preHandler: generalRateLimit }, async (request) => {
    const p = await requirePermission(request, 'projects:read');
    const project = await repos.projects.findById(idParams.parse(request.params).id, scopeOf(p));
    if (!project) throw new NotFoundAppError('project');
    return ok(project);
  });
  app.get('/api/v1/workspaces', { preHandler: generalRateLimit }, async (request) => {
    const p = await requirePermission(request, 'workspaces:read');
    const r = await repos.workspaces.list(paginationSchema.parse(request.query), scopeOf(p));
    return ok(r.items, { total: r.total, page: r.page, pageSize: r.pageSize });
  });
  app.post('/api/v1/organizations/:id/workspaces', { preHandler: generalRateLimit }, async (request, reply) => {
    const p = await requirePermission(request, 'workspaces:write');
    const organizationId = idParams.parse(request.params).id;
    if (!(await repos.organizations.findById(organizationId, scopeOf(p)))) throw new NotFoundAppError('organization');
    const i = workspaceSchema.parse(request.body);
    if (i.projectId) {
      const project = await repos.projects.findById(i.projectId, scopeOf(p));
      // A workspace may only reference a project of its own organization (cross-tenant reference guard).
      if (!project || project.organizationId !== organizationId) throw new NotFoundAppError('project');
    }
    const t = now();
    const workspace = await conflictOnDuplicate(
      () => repos.workspaces.create({ id: crypto.randomUUID(), organizationId, ...(i.projectId ? { projectId: i.projectId } : {}), name: i.name, slug: i.slug ?? slugify(i.name), environment: i.environment, createdAt: t, updatedAt: t, deletedAt: null }),
      'Workspace slug already exists in this organization.',
    );
    return reply.code(201).send(created(workspace));
  });
  const workspaceReadRateLimit = sharedRateLimitPreHandler(repos.rateLimits, { name: 'workspace-read', max: 120, windowMs: 60_000 });
  app.get('/api/v1/workspaces/:id', { preHandler: workspaceReadRateLimit }, async (request) => {
    const p = await requirePermission(request, 'workspaces:read');
    const w = await repos.workspaces.findById(idParams.parse(request.params).id, scopeOf(p));
    if (!w) throw new NotFoundAppError('workspace');
    return ok(w);
  });

  // ── Device data plane routes (mobile/desktop clients) ──────────────────────
  // Authenticated with the remote client access token issued by
  // POST /api/v1/auth/remote/token. Scopes are device-scoped: a client can only
  // read/write its own device's snapshot, analytics and policy.

  const requireRemoteClient = async (request: FastifyRequest): Promise<void> => {
    const token = authorizationToken(request);
    if (!token) throw new UnauthorizedAppError();
    let claims;
    try {
      claims = jwt.verify(token, 'access');
    } catch {
      throw new UnauthorizedAppError();
    }
    if (!claims.roles.includes('remote_client')) throw new ForbiddenAppError();
    const allowed = await rbac.authorize({
      principal: {
        id: claims.sub,
        roles: claims.roles,
        scopes: claims.scopes,
        ...(claims.organizationId ? { organizationId: claims.organizationId } : {}),
        metadata: { sessionId: claims.sessionId, jti: claims.jti },
      },
      resource: request.url,
      action: request.method,
      // Device ownership is enforced below; no additional permission required
      // beyond being an authenticated remote_client with a valid device token.
      requiredPermissions: [],
    });
    if (!allowed) throw new ForbiddenAppError();
    // Device ownership: a remote client may only touch its own device.
    const params = (request as { params?: { deviceId?: string } }).params ?? {};
    if (params.deviceId !== undefined && params.deviceId !== claims.sub)
      throw new ForbiddenAppError('device mismatch: token is not authorized for this device');
    (request as RemoteClientRequest).remoteClient = {
      deviceId: claims.sub,
      credentialId: claims.sessionId ?? '',
    };
  };

  type RemoteClientRequest = FastifyRequest & { remoteClient?: { deviceId: string; credentialId: string } };

  const deviceSnapshotRateLimit = sharedRateLimitPreHandler(repos.rateLimits, {
    name: 'device-snapshot',
    max: 30,
    windowMs: 60_000,
  });
  app.get<{ Params: { deviceId: string } }>(
    '/api/v1/remote/devices/:deviceId/snapshot',
    { preHandler: [deviceSnapshotRateLimit, (req, reply) => requireRemoteClient(req as RemoteClientRequest)] },
    async (request, reply) => {
      const req = request as RemoteClientRequest;
      const snapshot = await getNetworkSnapshot();
      const latestDns = snapshot.measurements.find((m: NetworkMeasurement) => m.probeType === 'dns');
      const latestInterfaces = snapshot.measurements.filter((m: NetworkMeasurement) => m.probeType === 'ip');
      const connection =
        snapshot.status === 'healthy'
          ? 'online'
          : snapshot.status === 'degraded' ? 'degraded' : 'offline';
      return ok({
        connection,
        interfaceCount: latestInterfaces.length,
        defaultRouteAvailable: latestInterfaces.length > 0,
        dnsReachable: Boolean(latestDns?.success),
        capturedAt: new Date(snapshot.score.timestamp).toISOString(),
      });
    },
  );

  const deviceAnalyticsRateLimit = sharedRateLimitPreHandler(repos.rateLimits, {
    name: 'device-analytics',
    max: 30,
    windowMs: 60_000,
  });
  app.get<{ Params: { deviceId: string } }>(
    '/api/v1/remote/devices/:deviceId/analytics',
    { preHandler: [deviceAnalyticsRateLimit, (req, reply) => requireRemoteClient(req as RemoteClientRequest)] },
    async (request, reply) => {
      const snapshot = await getNetworkSnapshot();
      const successful = snapshot.measurements.filter((m) => m.success);
      const latencies = successful
        .map((m) => m.latency)
        .filter((l): l is number => typeof l === 'number')
        .sort((a, b) => a - b);
      const median = latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : null;
      const total = snapshot.measurements.length;
      const successCount = successful.length;
      return ok({
        sampleCount: total,
        availabilityPercent: total > 0 ? (successCount / total) * 100 : 0,
        medianLatencyMs: median,
        packetLossPercent: total > 0 ? ((total - successCount) / total) * 100 : 0,
      });
    },
  );

  const devicePolicyRateLimit = sharedRateLimitPreHandler(repos.rateLimits, {
    name: 'device-policy',
    max: 10,
    windowMs: 60_000,
  });
  app.get<{ Params: { deviceId: string } }>(
    '/api/v1/remote/devices/:deviceId/policy',
    { preHandler: [devicePolicyRateLimit, (req, reply) => requireRemoteClient(req as RemoteClientRequest)] },
    async (request, reply) => {
      const req = request as RemoteClientRequest;
      const snapshot = await resilienceRuntime.getRuntimeSnapshot();
      return ok({
        autonomousMode: snapshot.mode === 'live',
      });
    },
  );

  app.post<{ Params: { deviceId: string }; Body: { autonomousMode: boolean } }>(
    '/api/v1/remote/devices/:deviceId/policy',
    { preHandler: [devicePolicyRateLimit, (req, reply) => requireRemoteClient(req as RemoteClientRequest)] },
    async (request, reply) => {
      const req = request as RemoteClientRequest;
      const { autonomousMode } = z.object({ autonomousMode: z.boolean() }).parse(request.body);
      const mode = autonomousMode ? 'live' as const : 'safe' as const;
      await resilienceRuntime.runCycle({
        mode,
        correlationId: `device-policy-${req.remoteClient!.deviceId}`,
        idempotencyKey: `device-policy-${req.remoteClient!.deviceId}-${mode}`,
      });
      const snapshot = await resilienceRuntime.getRuntimeSnapshot();
      return ok({
        autonomousMode: snapshot.mode === 'live',
        allowedActions: snapshot.policySnapshot.policy.allowedActions,
        mode: snapshot.mode,
      });
    },
  );

  // Extended product API routes. Registered inside buildServer so the main server
  // (not just the Vercel handler) serves the full surface. The shared rate-limit
  // store (PostgreSQL-backed in production) keeps limits consistent across instances.
  registerUnifiedProductRoutes(app, { rateLimitStore: repos.rateLimits });
  if (process.env.DATABASE_URL) {
    registerHistoryRoutes(app, new PostgresHistoricalMeasurementStore(db));
  } else {
    registerHistoryRoutes(app);
  }
  registerRemoteClientRoutes(app);
  registerProbeFederationRoutes(app);
  registerNotificationIncidentRoutes(app);

  app.addHook('onClose', async () => {
    await db.$disconnect();
    await repos.close();
  });

  return app;
};

// Export Speed Insights utilities for use in other modules
export {
  generateSpeedInsightsScript,
  injectSpeedInsightsIntoHtml,
  initializeSpeedInsights,
  defaultSpeedInsightsConfig,
  type SpeedInsightsConfig,
};


const requiredProductionEnvironment = [
  'JWT_SECRET',
  'REMOTE_CLIENT_CREDENTIAL_KEY',
  'REMOTE_CLIENT_REFRESH_KEY',
  'DATABASE_URL',
] as const;

let vercelAppPromise: Promise<FastifyInstance> | undefined;

const getVercelApp = (): Promise<FastifyInstance> => {
  if (!vercelAppPromise) {
    if (['production', 'staging'].includes((process.env.NODE_ENV ?? '').toLowerCase())) {
      const missing = requiredProductionEnvironment.filter((name) => !process.env[name]?.trim());
      if (missing.length > 0) {
        throw new Error(
          `Missing required production API environment variables: ${missing.join(', ')}`,
        );
      }
    }

    vercelAppPromise = buildServer().then((app) => {
      return app;
    }).catch((error: unknown) => {
      vercelAppPromise = undefined;
      throw error;
    });
  }
  return vercelAppPromise;
};

/**
 * Vercel's Node.js function loader resolves apps/api/package.json's main field
 * to dist/index.js. Export a default Node handler from this source so the
 * compiled entrypoint is valid and Fastify remains lazily initialized.
 */
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const app = await getVercelApp();
  await app.ready();
  app.server.emit('request', request, response);
}

if (process.env.VERCEL !== '1' && process.argv[1]?.endsWith('index.js')) {
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