import { describe, expect, it } from 'vitest';
import {
  createBuiltinProviders,
  IntelligentDnsEngine,
  type DnsHealthCheck,
  type DnsProvider,
} from './index.js';

describe('DNS providers', () => {
  it('creates all builtin providers with required capabilities', async () => {
    const providers = createBuiltinProviders({});
    expect(providers.map((p) => p.id)).toEqual([
      'cloudflare',
      'google',
      'quad9',
      'opendns',
      'controld',
      'adguard',
      'nextdns',
      'cleanbrowsing',
    ]);
    expect(providers.every((p) => p.supportsDoH())).toBe(true);
    expect(providers.some((p) => p.supportsDNSSEC())).toBe(true);
    expect(providers.some((p) => p.supportsDoT())).toBe(true);
  });
});

const provider = (id: string, latency: number, _healthy = true): DnsProvider => {
  const details = {
    id,
    name: id,
    homepage: 'https://example.com',
    endpoints: { ipv4: ['1.1.1.1'], ipv6: ['::1'] },
    tags: ['test'],
    dnssec: true,
  };
  const config = { enabled: true, timeoutMs: 2000, protocols: ['udp' as const] };
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
    health: async () => ({
      healthy: true,
      latencyMs: latency,
      checkedAt: new Date().toISOString(),
    }),
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
    await expect(engine.resolve({ name: 'example.test', recordType: 'A' })).resolves.toHaveLength(
      1,
    );
  });

  it('applies block rules deterministically by priority', async () => {
    const health: DnsHealthCheck = {
      check: async () => ({
        healthy: true,
        latencyMs: 10,
        checkedAt: new Date().toISOString(),
      }),
    };
    const engine = new IntelligentDnsEngine([provider('fast', 10)], health, undefined, [
      { id: 'block-test', priority: 100, match: 'suffix', value: '.blocked.test', action: 'block' },
    ]);
    await expect(engine.resolve({ name: 'ads.blocked.test', recordType: 'A' })).rejects.toThrow(
      'blocked',
    );
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

import {
  DnsOverHttpsTransport,
  DnsOverQuicTransport,
  DnsTransportError,
  DnsTransportRegistry,
  SecureDnsTransportEngine,
  createDefaultDnsTransportRegistry,
  dnsTransportSecurityProfiles,
  encodeDnsQuery,
  validateDohEndpoint,
  validateDotEndpoint,
  validateDnsWireResponse,
  type SecureDnsTransport,
  type DnsTransportContext,
  type DnsWireMessage,
  type TransportConnection,
} from './index.js';

class FixtureTransport implements SecureDnsTransport {
  state = 'available' as const;
  connections = 0;
  queries = 0;
  capabilities: import('./index.js').DnsTransportCapability[];
  constructor(
    readonly id: string,
    readonly type: 'doh' | 'dot' | 'udp',
    readonly fail = false,
  ) {
    this.capabilities =
      this.type === 'udp'
        ? ['plaintext', 'wire-format']
        : [
            'encrypted',
            'tls',
            'certificate-validation',
            'hostname-verification',
            'connection-reuse',
            'wire-format',
          ];
  }
  endpoint() {
    return {
      hostname: `${this.type}.example.test`,
      port: this.type === 'dot' ? 853 : 443,
      path: '/dns-query',
      tlsServerName: `${this.type}.example.test`,
    };
  }
  supports() {
    return true;
  }
  async connect(): Promise<TransportConnection> {
    this.connections++;
    if (this.fail)
      throw new DnsTransportError(
        'ConnectionTimeout',
        'fixture timeout',
        true,
        'retryable-transport',
      );
    return {
      id: `${this.id}-conn`,
      key: '',
      transportId: this.id,
      type: this.type,
      endpoint: this.endpoint(),
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      expiresAt: Date.now() + 1000,
      state: 'open',
    };
  }
  async resolve(
    _connection: TransportConnection,
    query: DnsWireMessage,
    _context: DnsTransportContext,
  ): Promise<DnsWireMessage> {
    this.queries++;
    return query;
  }
  async close(connection: TransportConnection): Promise<void> {
    connection.state = 'closed';
  }
}

const secureProvider = (protocols: Array<'udp' | 'doh' | 'dot'> = ['doh', 'dot']): DnsProvider => ({
  ...provider('secure', 10),
  config: { enabled: true, timeoutMs: 1000, protocols },
  metadata: () => ({
    id: 'secure',
    name: 'secure',
    homepage: 'https://example.test',
    endpoints: {
      ipv4: ['192.0.2.1'],
      ipv6: [],
      doh: 'https://doh.example.test/dns-query',
      dot: 'dot.example.test',
    },
    tags: ['test'],
  }),
});

describe('Phase 15 secure DNS transport layer', () => {
  it('registers built-in DoH, DoT, and DoQ extension transports', () => {
    const registry = createDefaultDnsTransportRegistry();
    expect(registry.byType('doh')).toHaveLength(1);
    expect(registry.byType('dot')).toHaveLength(1);
    expect(registry.byType('doq')[0]).toBeInstanceOf(DnsOverQuicTransport);
  });

  it('validates secure endpoints and rejects insecure DoH URLs', () => {
    expect(validateDohEndpoint('https://dns.example.test/dns-query').hostname).toBe(
      'dns.example.test',
    );
    expect(validateDotEndpoint('dot.example.test').port).toBe(853);
    expect(() => validateDohEndpoint('http://dns.example.test/dns-query')).toThrow(
      DnsTransportError,
    );
    expect(() => validateDotEndpoint('tls://dot.example.test')).toThrow(DnsTransportError);
  });

  it('encodes bounded DNS wire messages and validates response IDs', () => {
    const query = encodeDnsQuery({ name: 'example.test', recordType: 'A' });
    expect(query.payload.length).toBeGreaterThan(12);
    expect(validateDnsWireResponse(query.payload, query).id).toBe(query.id);
    const mismatched = Buffer.from(query.payload);
    mismatched.writeUInt16BE((query.id + 1) % 65535, 0);
    expect(() => validateDnsWireResponse(mismatched, query)).toThrow(
      'DNS response id does not match',
    );
    expect(() => validateDnsWireResponse(Buffer.alloc(5000), undefined, 1024)).toThrow(
      'exceeds configured limit',
    );
  });

  it('simulates transport selection without connecting', async () => {
    const doh = new FixtureTransport('fixture.doh', 'doh');
    const dot = new FixtureTransport('fixture.dot', 'dot');
    const registry = new DnsTransportRegistry();
    registry.register(doh);
    registry.register(dot);
    const engine = new SecureDnsTransportEngine({ registry });
    const decision = await engine.simulateDnsTransportSelection(
      { name: 'example.test', recordType: 'A' },
      secureProvider(),
    );
    expect(decision.dryRun).toBe(true);
    expect(decision.selectedTransport?.transport.type).toBe('doh');
    expect(doh.connections).toBe(0);
  });

  it('prevents plaintext downgrade in strict mode', async () => {
    const registry = new DnsTransportRegistry();
    registry.register(new FixtureTransport('fixture.udp', 'udp'));
    const engine = new SecureDnsTransportEngine({ registry });
    const decision = await engine.simulateDnsTransportSelection(
      { name: 'example.test', recordType: 'A' },
      secureProvider(['udp']),
      { securityProfile: dnsTransportSecurityProfiles.strict },
    );
    expect(decision.selectedTransport).toBeUndefined();
    expect(decision.rejectedCandidates[0]?.reason).toContain('disallows udp');
  });

  it('falls back only across policy-compliant secure transports', async () => {
    const registry = new DnsTransportRegistry();
    registry.register(new FixtureTransport('fixture.doh', 'doh', true));
    const dot = new FixtureTransport('fixture.dot', 'dot');
    registry.register(dot);
    const engine = new SecureDnsTransportEngine({
      registry,
      config: { retry: { maxAttempts: 1, initialDelayMs: 1, maxDelayMs: 1, jitterRatio: 0 } },
    });
    const response = await engine.resolve(
      { name: 'example.test', recordType: 'A' },
      secureProvider(),
      { securityProfile: dnsTransportSecurityProfiles.strict },
    );
    expect(response.payload.length).toBeGreaterThan(0);
    expect(dot.queries).toBe(1);
  });

  it('reuses bounded pooled connections and shuts down gracefully', async () => {
    const doh = new FixtureTransport('fixture.doh', 'doh');
    const registry = new DnsTransportRegistry();
    registry.register(doh);
    const engine = new SecureDnsTransportEngine({
      registry,
      config: {
        pool: { maxConnections: 1, idleTimeoutMs: 1000, maxLifetimeMs: 1000, keepAlive: true },
      },
    });
    await engine.resolve({ name: 'one.example.test', recordType: 'A' }, secureProvider());
    await engine.resolve({ name: 'two.example.test', recordType: 'A' }, secureProvider());
    expect(doh.connections).toBe(1);
    expect(engine.poolSize()).toBe(1);
    await engine.shutdown();
    expect(engine.poolSize()).toBe(0);
  });

  it('classifies DoQ as an explicit unimplemented extension point', async () => {
    await expect(new DnsOverQuicTransport().connect()).rejects.toMatchObject({
      code: 'QuicHandshakeFailed',
      retryable: false,
    });
  });

  it('rejects attempts to disable TLS certificate or hostname validation', () => {
    expect(
      () =>
        new SecureDnsTransportEngine({
          config: {
            tls: {
              minVersion: 'TLSv1.2',
              requireCertificateValidation: false as true,
              requireHostnameVerification: true,
            },
          },
        }),
    ).toThrow('TLS certificate and hostname validation cannot be disabled');
  });

  it('constructs DoH transport with application/dns-message capability', () => {
    const doh = new DnsOverHttpsTransport();
    expect(doh.capabilities).toContain('https');
    expect(doh.endpoint(secureProvider())?.path).toBe('/dns-query');
  });
});
