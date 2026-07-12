import { describe, expect, it } from 'vitest';
import { createBuiltinProviders, type DnsResolver } from './index.js';

describe('DNS providers', () => {
  it('creates all builtin providers with required capabilities', async () => {
    const resolver: DnsResolver = { protocol: 'udp', resolve: async (question) => [{ ...question, ttl: 60, value: '127.0.0.1' }] };
    const providers = createBuiltinProviders({}, [resolver]);
    expect(providers.map((p) => p.id)).toEqual(['cloudflare', 'google', 'quad9', 'opendns', 'controld', 'adguard', 'nextdns', 'cleanbrowsing']);
    await expect(providers[0]?.resolveIPv4('example.test')).resolves.toEqual(['127.0.0.1']);
    expect(providers.every((p) => p.supportsDoH() && p.supportsDoT() && p.supportsDNSSEC())).toBe(true);
  });
});
