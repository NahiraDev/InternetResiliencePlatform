import Fastify from 'fastify';
import { loadConfig } from '@irp/config';
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
