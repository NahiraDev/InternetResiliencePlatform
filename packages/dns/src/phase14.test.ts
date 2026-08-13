import { describe, expect, it, vi } from 'vitest';
import {
  SmartDnsEngine,
  createDnsQuery,
  createResolverHealth,
  type DnsResponse,
  type DnsTransport,
  type SmartDnsResolver,
} from './index.js';

const resolver = (id: string, score = 100, priority = 50): SmartDnsResolver => ({
  id,
  name: id,
  type: 'public',
  addresses: ['192.0.2.1'],
  transport: 'udp',
  family: 'ipv4',
  capabilities: ['ipv4', 'udp'],
  priority,
  health: createResolverHealth({ score, latencyMs: 20, reliability: score / 100 }),
  state: score >= 80 ? 'healthy' : score >= 40 ? 'degraded' : 'failed',
  enabled: true,
  metadata: {},
});
const transport = (
  state: DnsResponse['rcode'] = 'success',
  value = '203.0.113.10',
): DnsTransport => ({
  id: 'mock-udp',
  type: 'udp',
  supports: () => true,
  async resolve(query, r) {
    return {
      queryId: query.id,
      answers:
        state === 'success'
          ? [{ name: query.name, type: query.type, class: query.class, ttl: 1, value }]
          : [],
      authority: [],
      additional: [],
      rcode: state,
      flags: {},
      ttl: 1,
      resolverId: r.id,
      transport: r.transport,
      latencyMs: 5,
      validation: { valid: true, dnssec: 'not-checked', anomaly: 'normal', reasons: [] },
      metadata: {},
    };
  },
});

describe('SmartDnsEngine phase 14', () => {
  it('registers resolvers and rejects duplicates', () => {
    const e = new SmartDnsEngine();
    e.registerResolver(resolver('a'));
    expect(e.registry.get('a').id).toBe('a');
    expect(() => e.registerResolver(resolver('a'))).toThrow(/already/);
  });
  it('selects healthy resolver over higher-priority failed resolver deterministically', async () => {
    const e = new SmartDnsEngine();
    e.registerResolver(resolver('failed', 10, 100));
    e.registerResolver(resolver('healthy', 90, 80));
    const d = await e.simulateDnsResolution({
      query: createDnsQuery({ name: 'example.com', type: 'A' }),
    });
    expect(d.selectedResolver?.id).toBe('healthy');
    expect(d.rejectedCandidates[0]?.resolver.id).toBe('failed');
  });
  it('executes fallback with bounded retry budget', async () => {
    const e = new SmartDnsEngine({ config: { retryCount: 1, cooldownMs: 0 } });
    e.registerTransport({
      ...transport(),
      async resolve(q, r) {
        if (r.id === 'a') throw new Error('timeout');
        return transport().resolve(q, r, { query: q });
      },
    });
    e.registerResolver(resolver('a'));
    e.registerResolver(resolver('b'));
    const result = await e.resolve({ name: 'example.com', type: 'A' });
    expect(result.state).toBe('success');
    expect(result.attempts.map((a) => a.resolverId)).toEqual(['a', 'b']);
  });
  it('caches positive and negative answers with expiration and bounds', async () => {
    vi.useFakeTimers();
    const e = new SmartDnsEngine({
      config: {
        maxCacheEntries: 1,
        minTtlMs: 1000,
        maxTtlMs: 1000,
        negativeTtlMs: 1000,
        cooldownMs: 0,
      },
    });
    e.registerTransport(transport('nxdomain'));
    e.registerResolver(resolver('a'));
    const first = await e.resolve({ name: 'missing.example', type: 'A' });
    const second = await e.resolve({ name: 'missing.example', type: 'A' });
    expect(first.state).toBe('nxdomain');
    expect(second.cached).toBe(true);
    vi.advanceTimersByTime(1001);
    await Promise.resolve();
    expect(e.cache.get(createDnsQuery({ name: 'missing.example' }))).toBeUndefined();
    vi.useRealTimers();
  });
  it('coalesces concurrent identical queries', async () => {
    let calls = 0;
    const e = new SmartDnsEngine({ config: { cooldownMs: 0 } });
    e.registerTransport({
      ...transport(),
      async resolve(q, r) {
        calls++;
        await new Promise((res) => setTimeout(res, 5));
        return transport().resolve(q, r, { query: q });
      },
    });
    e.registerResolver(resolver('a'));
    const [a, b, c] = await Promise.all([
      e.resolve({ name: 'same.example' }),
      e.resolve({ name: 'same.example' }),
      e.resolve({ name: 'same.example' }),
    ]);
    expect([a.state, b.state, c.state]).toEqual(['success', 'success', 'success']);
    expect(calls).toBe(1);
  });
});
