import Fastify from 'fastify';
import { loadConfig } from '@irp/config';
import { Application } from '@irp/core';
import { createLogger } from '@irp/logger';
import { ConnectivityMonitor } from '@irp/network';
import { MetricsRegistry } from '@irp/telemetry';
export const buildServer = (runtime = new Application(loadConfig(), createLogger('info'))) => { const app = Fastify({ logger: false }); const network = new ConnectivityMonitor(); const metrics = new MetricsRegistry(); app.get('/health', async () => ({ status: runtime.state })); app.get('/version', async () => ({ name: 'InternetResiliencePlatform', version: runtime.config.app.version })); app.get('/status', async () => ({ status: runtime.state })); app.get('/providers', async () => runtime.providers.map((p) => ({ id: p.id, name: p.name, metadata: p.metadata(), score: runtime.scorer.score(p, runtime.benchmark.stats(p.id)) }))); app.get('/providers/:id', async (request, reply) => { const provider = runtime.providers.find((p) => p.id === (request.params as { id: string }).id); if (!provider) return reply.code(404).send({ error: 'provider not found' }); return { id: provider.id, name: provider.name, metadata: provider.metadata(), health: await provider.health() }; }); app.get('/benchmark', async () => runtime.benchmark.snapshot()); app.post('/benchmark', async () => runtime.benchmark.run(runtime.providers)); app.get('/metrics', async () => { metrics.collectRuntime(); return metrics.snapshot(); }); app.get('/events', async () => runtime.events.snapshot()); app.get('/network', async () => network.status()); app.get('/config', async () => runtime.config); app.post('/reload', async () => { const config = loadConfig(); await runtime.reload(config); return { reloaded: true }; }); return app; };
if (process.argv[1]?.endsWith('index.js')) { const config = loadConfig(); const runtime = new Application(config, createLogger(config.logger.level)); await runtime.start(); const server = buildServer(runtime); await server.listen({ host: config.api.host, port: config.api.port }); }
import { IntelligentDnsEngine, defaultDnsEngineConfig, type DnsHealthCheck, type DnsProvider } from '@irp/dns';

const demoProviders: DnsProvider[] = [
  { id: 'cloudflare', name: 'Cloudflare', addresses: ['1.1.1.1', '1.0.0.1'], privacyScore: 0.9, securityScore: 0.8, supportsDnssec: true, resolvers: [{ resolve: async (question) => [{ ...question, ttl: 300, value: '1.1.1.1', dnssecValidated: true }] }] },
  { id: 'quad9', name: 'Quad9', addresses: ['9.9.9.9', '149.112.112.112'], privacyScore: 0.85, securityScore: 0.95, supportsDnssec: true, resolvers: [{ resolve: async (question) => [{ ...question, ttl: 300, value: '9.9.9.9', dnssecValidated: true }] }] },
];
const healthCheck: DnsHealthCheck = { check: async (provider) => ({ healthy: true, latencyMs: provider.id === 'cloudflare' ? 20 : 35, packetLoss: 0, dnssecValid: provider.supportsDnssec }) };
const engine = new IntelligentDnsEngine(demoProviders, healthCheck, defaultDnsEngineConfig());

export const buildServer = () => {
  const app = Fastify({ logger: false });
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/version', async () => ({ name: 'InternetResiliencePlatform', version: '0.1.0' }));
  app.get('/status', async () => ({ status: 'ready', dns: engine.status() }));
  app.get('/dns/status', async () => engine.status());
  app.get('/dns/providers', async () => engine.rankProviders());
  app.get('/dns/cache', async () => engine.cache.stats());
  app.get('/dns/policies', async () => ({ profiles: engine.profiles, strategy: engine.status().strategy }));
  app.get('/dns/rules', async () => engine.rules.list());
  app.get('/dns/history', async () => engine.status().providers.map((provider) => ({ providerId: provider.provider.id, prediction: provider.prediction, reasons: provider.reasons })));
  app.get('/dns/events', async () => engine.events);
  app.post('/dns/cache/flush', async () => ({ flushed: engine.cache.flush() }));
  app.post<{ Body: { providerId: string } }>('/dns/providers/select', async (request) => { engine.selectProvider(request.body.providerId); return engine.status(); });
  app.post('/dns/reload', async () => { await engine.evaluate(); return engine.status(); });
  return app;
};
if (process.argv[1]?.endsWith('index.js')) { const config = loadConfig(); const server = buildServer(); await server.listen({ host: config.api.host, port: config.api.port }); }
