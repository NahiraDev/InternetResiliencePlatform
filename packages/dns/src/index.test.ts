import { describe, expect, it } from 'vitest';
import { IntelligentDnsEngine, type DnsHealthCheck, type DnsProvider } from './index.js';

const provider = (id: string, latency: number, healthy = true): DnsProvider => ({ id, name: id, addresses: ['1.1.1.1'], privacyScore: id === 'privacy' ? 1 : 0.5, securityScore: 0.8, supportsDnssec: true, resolvers: [{ resolve: async (question) => [{ ...question, ttl: 60, value: id === 'fast' ? '1.1.1.1' : '9.9.9.9', dnssecValidated: true }] }] });

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
