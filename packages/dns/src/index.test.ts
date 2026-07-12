import { describe, expect, it } from 'vitest';
import { createBuiltinProviders, IntelligentDnsEngine, type DnsHealthCheck, type DnsProvider } from './index.js';

describe('DNS providers', () => {
  it('creates all builtin providers with required capabilities', async () => {
    const providers = createBuiltinProviders({});
    expect(providers.map((p) => p.id)).toEqual(['cloudflare', 'google', 'quad9', 'opendns', 'controld', 'adguard', 'nextdns', 'cleanbrowsing']);
    expect(providers.every((p) => p.supportsDNSSEC() && p.supportsDoH() && p.supportsDoT())).toBe(true);
  });
});

const provider = (id: string, latency: number, _healthy = true): DnsProvider => {
  const details = { id, name: id, homepage: 'https://example.com', endpoints: { ipv4: ['1.1.1.1'], ipv6: ['::1'] }, tags: ['test'], dnssec: true };
  const config = { enabled: true, timeoutMs: 2000, protocols: ['udp'] as const };
  return {
    id,
    name: id,
    config,
    addresses: ['1.1.1.1'],
    privacyScore: id === 'privacy' ? 1 : 0.5,
    securityScore: 0.8,
    resolve: async (q) => [{ ...q, ttl: 60, value: '127.0.0.1' }],
    resolveIPv4: async () => ['1.1.1.1'],
    resolveIPv6: async () => ['2606:4700:4700::1111'],
    supportsDNSSEC: () => true,
    supportsDoH: () => true,
    supportsDoT: () => true,
    metadata: () => details,
    health: async () => ({ healthy: true, latencyMs: latency, checkedAt: new Date().toISOString() }),
  };
};

describe('IntelligentDnsEngine', () => {
  it('ranks healthy low latency providers first and resolves through active provider', async () => {
    const health: DnsHealthCheck = {
      check: async (p) => ({
        healthy: true,
        latencyMs: p.id === 'fast' ? 10 : 80,
        checkedAt: new Date().toISOString(),
      }),
    };
    const engine = new IntelligentDnsEngine([provider('slow', 80), provider('fast', 10)], health);
    const ranked = await engine.evaluate();
    expect(ranked[0]?.provider.id).toBe('fast');
    expect(engine.status().activeProviderId).toBe('fast');
    await expect(engine.resolve({ name: 'example.test', recordType: 'A' })).resolves.toHaveLength(1);
  });

  it('applies block rules deterministically by priority', async () => {
    const health: DnsHealthCheck = {
      check: async () => ({
        healthy: true,
        latencyMs: 10,
        checkedAt: new Date().toISOString(),
      }),
    };
    const engine = new IntelligentDnsEngine(
      [provider('fast', 10)],
      health,
      undefined,
      [{ id: 'block-test', priority: 100, match: 'suffix', value: '.blocked.test', action: 'block' }],
    );
    await expect(engine.resolve({ name: 'ads.blocked.test', recordType: 'A' })).rejects.toThrow('blocked');
  });

  it('tracks cache hit ratio', async () => {
    const health: DnsHealthCheck = {
      check: async () => ({
        healthy: true,
        latencyMs: 10,
        checkedAt: new Date().toISOString(),
      }),
    };
    const engine = new IntelligentDnsEngine([provider('fast', 10)], health);
    await engine.resolve({ name: 'cache.test', recordType: 'A' });
    await engine.resolve({ name: 'cache.test', recordType: 'A' });
    expect(engine.cache.stats().hitRatio).toBeGreaterThan(0);
  });
});
