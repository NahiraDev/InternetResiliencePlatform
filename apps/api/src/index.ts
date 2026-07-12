import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { z } from 'zod';
import { loadConfig } from '@irp/config';
import { mapErrorToHttp } from '@irp/core';
import { createLogger } from '@irp/logger';
import { createHealthStatus, httpRequestDuration, renderPrometheusMetrics } from '@irp/telemetry';
import { AnonymousAuthenticationProvider, AllowAnonymousAuthorization } from '@irp/auth';
import { InMemoryEventBus } from '@irp/events';
import { MemoryQueue } from '@irp/queue';
import { Application } from '@irp/core';
import { createLogger } from '@irp/logger';
import { ConnectivityMonitor } from '@irp/network';
import { MetricsRegistry } from '@irp/telemetry';
export const buildServer = (runtime = new Application(loadConfig(), createLogger('info'))) => { const app = Fastify({ logger: false }); const network = new ConnectivityMonitor(); const metrics = new MetricsRegistry(); app.get('/health', async () => ({ status: runtime.state })); app.get('/version', async () => ({ name: 'InternetResiliencePlatform', version: runtime.config.app.version })); app.get('/status', async () => ({ status: runtime.state })); app.get('/providers', async () => runtime.providers.map((p) => ({ id: p.id, name: p.name, metadata: p.metadata(), score: runtime.scorer.score(p, runtime.benchmark.stats(p.id)) }))); app.get('/providers/:id', async (request, reply) => { const provider = runtime.providers.find((p) => p.id === (request.params as { id: string }).id); if (!provider) return reply.code(404).send({ error: 'provider not found' }); return { id: provider.id, name: provider.name, metadata: provider.metadata(), health: await provider.health() }; }); app.get('/benchmark', async () => runtime.benchmark.snapshot()); app.post('/benchmark', async () => runtime.benchmark.run(runtime.providers)); app.get('/metrics', async () => { metrics.collectRuntime(); return metrics.snapshot(); }); app.get('/events', async () => runtime.events.snapshot()); app.get('/network', async () => network.status()); app.get('/config', async () => runtime.config); app.post('/reload', async () => { const config = loadConfig(); await runtime.reload(config); return { reloaded: true }; }); return app; };
if (process.argv[1]?.endsWith('index.js')) { const config = loadConfig(); const runtime = new Application(config, createLogger(config.logger.level)); await runtime.start(); const server = buildServer(runtime); await server.listen({ host: config.api.host, port: config.api.port }); }
import { IntelligentDnsEngine, defaultDnsEngineConfig, type DnsHealthCheck, type DnsProvider } from '@irp/dns';

const versionResponse = z.object({ name: z.string(), version: z.string(), environment: z.string() });
const healthResponse = z.object({ state: z.string(), checks: z.record(z.string()), updatedAt: z.string() });
const validateResponse = <T>(schema: z.ZodSchema<T>, payload: T): T => schema.parse(payload);

export const buildServer = async (): Promise<FastifyInstance> => {
  const config = loadConfig();
  const logger = createLogger({ level: config.logger.level, pretty: config.app.environment === 'development', service: 'irp-api' });
  const app = Fastify({ logger: false, genReqId: (request) => request.headers['x-request-id']?.toString() ?? crypto.randomUUID() });
  const authProvider = new AnonymousAuthenticationProvider();
  const authorization = new AllowAnonymousAuthorization();
  const events = new InMemoryEventBus();
  const queue = new MemoryQueue();

  app.setErrorHandler((error, _request, reply) => { const mapped = mapErrorToHttp(error); reply.status(mapped.statusCode).send(mapped.body); });
  app.addHook('onRequest', async (request) => { request.headers['x-correlation-id'] = request.headers['x-correlation-id'] ?? request.id; await authProvider.authenticate({ headers: request.headers }); await authorization.authorize({ principal: null, resource: request.url, action: request.method }); });
  app.addHook('onResponse', async (request, reply) => { httpRequestDuration.observe({ method: request.method, route: request.routeOptions.url ?? request.url, status_code: String(reply.statusCode) }, reply.elapsedTime / 1000); logger.info('request completed', { requestId: request.id, correlationId: request.headers['x-correlation-id'], method: request.method, url: request.url, statusCode: reply.statusCode, elapsedMs: reply.elapsedTime }); });

  await app.register(cors);
  await app.register(helmet);
  await app.register(swagger, { openapi: { info: { title: 'InternetResiliencePlatform API', version: config.app.version }, servers: [{ url: '/api/v1' }] } });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.get('/api/v1/version', async () => validateResponse(versionResponse, { name: config.app.name, version: config.app.version, environment: config.app.environment }));
  app.get('/api/v1/health', async () => validateResponse(healthResponse, createHealthStatus({ api: 'healthy' })));
  app.get('/api/v1/ready', async () => validateResponse(healthResponse, createHealthStatus({ api: 'healthy', queue: queue.size() >= 0 ? 'healthy' : 'unhealthy' })));
  app.get('/api/v1/live', async () => validateResponse(healthResponse, createHealthStatus({ process: 'healthy' })));
  app.get('/api/v1/metrics', async (_request, reply) => reply.type('text/plain').send(await renderPrometheusMetrics()));
  app.post('/api/v1/events/test', async () => { const event = { id: crypto.randomUUID(), type: 'platform.test', aggregateId: 'platform', occurredAt: new Date(), payload: { ok: true } }; await events.publish(event); return { published: true, eventId: event.id }; });
  return app;
};

if (process.argv[1]?.endsWith('index.js')) { const config = loadConfig(); const server = await buildServer(); await server.listen({ host: config.api.host, port: config.api.port }); }
