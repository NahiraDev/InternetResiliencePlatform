import { describe, expect, it } from 'vitest';
import { createBuiltinProviders, type DnsResolver, IntelligentDnsEngine, type DnsHealthCheck, type DnsProvider } from './index.js';

describe('DNS providers', () => {
  it('creates all builtin providers with required capabilities', async () => {
    const resolver: DnsResolver = { protocol: 'udp', resolve: async (question) => [{ ...question, ttl: 60, value: '127.0.0.1' }] };
    const providers = createBuiltinProviders({}, [resolver]);
    expect(providers.map((p) => p.id)).toEqual(['cloudflare', 'google', 'quad9', 'opendns', 'controld', 'adguard', 'nextdns', 'cleanbrowsing']);
    await expect(providers[0]?.resolveIPv4('example.test')).resolves.toEqual(['127.0.0.1']);
    expect(providers.every((p) => p.supportsDoH() && p.supportsDoT() && p.supportsDNSSEC())).toBe(true);
  });
});

const provider = (id: string, latency: number, _healthy = true): DnsProvider => ({
  id,
  name: id,
  addresses: ['1.1.1.1'],
  privacyScore: id === 'privacy' ? 1 : 0.5,
  securityScore: 0.8,
  supportsDNSSEC: () => true,
  supportsDoH: () => true,
  supportsDoT: () => true,
  resolveIPv4: async () => ['1.1.1.1'],
  resolveIPv6: async () => ['2606:4700:4700::1111'],
});

describe('IntelligentDnsEngine', () => {
  it('ranks healthy low latency providers first and resolves through active provider', async () => {
    const health: DnsHealthCheck = { check: async (p) => ({ healthy: true, latencyMs: p.id === 'fast' ? 10 : 80, packetLoss: 0 }) };
    const engine = new IntelligentDnsEngine([provider('slow', 80), provider('fast', 10)], health);
    const ranked = await engine.evaluate();
    expect(ranked[0]?.provider.id).toBe('fast');
    expect(engine.status().activeProviderId).toBe('fast');
    await expect(engine.resolve({ name: 'example.test', recordType: 'A' })).resolves.toHaveLength(1);
  });

  it('applies block rules deterministically by priority', async () => {
    const health: DnsHealthCheck = { check: async () => ({ healthy: true, latencyMs: 10, packetLoss: 0 }) };
    const engine = new IntelligentDnsEngine([provider('fast', 10)], health, undefined, [{ id: 'block-test', priority: 100, match: 'suffix', value: '.blocked.test', action: 'block' }]);
    await expect(engine.resolve({ name: 'ads.blocked.test', recordType: 'A' })).rejects.toThrow('blocked');
  });

  it('tracks cache hit ratio', async () => {
    const health: DnsHealthCheck = { check: async () => ({ healthy: true, latencyMs: 10, packetLoss: 0 }) };
    const engine = new IntelligentDnsEngine([provider('fast', 10)], health);
    await engine.resolve({ name: 'cache.test', recordType: 'A' });
    await engine.resolve({ name: 'cache.test', recordType: 'A' });
    expect(engine.cache.stats().hitRatio).toBeGreaterThan(0);
  });
});
