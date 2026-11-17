import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { resolveTrustProxy, toFastifyTrustProxy } from './trust-proxy.js';

describe('resolveTrustProxy', () => {
  it('defaults to not trusting any proxy', () => {
    expect(resolveTrustProxy({})).toBe(false);
    expect(resolveTrustProxy({ IRP_TRUST_PROXY: '' })).toBe(false);
    expect(resolveTrustProxy({ IRP_TRUST_PROXY: 'false' })).toBe(false);
  });

  it('accepts a hop count', () => {
    expect(resolveTrustProxy({ IRP_TRUST_PROXY: '1' })).toBe(1);
    expect(resolveTrustProxy({ IRP_TRUST_PROXY: ' 2 ' })).toBe(2);
  });

  it('accepts proxy addresses, CIDRs and named ranges', () => {
    expect(resolveTrustProxy({ IRP_TRUST_PROXY: '10.0.0.0/8, 127.0.0.1,loopback,::1' })).toEqual([
      '10.0.0.0/8',
      '127.0.0.1',
      'loopback',
      '::1',
    ]);
  });

  it('allows trusting every hop outside production only', () => {
    expect(resolveTrustProxy({ IRP_TRUST_PROXY: 'true', NODE_ENV: 'development' })).toBe(true);
    expect(() => resolveTrustProxy({ IRP_TRUST_PROXY: 'true', NODE_ENV: 'production' })).toThrow(
      /spoof/,
    );
  });

  it.each(['0', '33', '300.1.1.1', '10.0.0.0/33', 'not-an-ip', ',', '1.2.3'])(
    'rejects malformed value %s instead of silently falling back',
    (value) => {
      expect(() => resolveTrustProxy({ IRP_TRUST_PROXY: value })).toThrow(/IRP_TRUST_PROXY/);
    },
  );
});

describe('trustProxy and client IP (what rate limits key on)', () => {
  const clientIpBehind = async (setting: ReturnType<typeof resolveTrustProxy>) => {
    const app = Fastify({ trustProxy: toFastifyTrustProxy(setting) });
    app.get('/ip', async (request) => ({ ip: request.ip }));
    const res = await app.inject({
      method: 'GET',
      url: '/ip',
      remoteAddress: '10.0.0.5',
      headers: { 'x-forwarded-for': '203.0.113.9' },
    });
    await app.close();
    return (res.json() as { ip: string }).ip;
  };

  it('keys on the proxy address when no proxy is trusted (spoofed header ignored)', async () => {
    expect(await clientIpBehind(resolveTrustProxy({}))).toBe('10.0.0.5');
  });

  it('keys on the real client when the proxy hop is trusted', async () => {
    expect(await clientIpBehind(resolveTrustProxy({ IRP_TRUST_PROXY: '1' }))).toBe('203.0.113.9');
    expect(await clientIpBehind(resolveTrustProxy({ IRP_TRUST_PROXY: '10.0.0.0/8' }))).toBe(
      '203.0.113.9',
    );
  });

  it('a hop count of 1 trusts only the nearest proxy, not a client-supplied chain', async () => {
    const app = Fastify({
      trustProxy: toFastifyTrustProxy(resolveTrustProxy({ IRP_TRUST_PROXY: '1' })),
    });
    app.get('/ip', async (request) => ({ ip: request.ip }));
    const res = await app.inject({
      method: 'GET',
      url: '/ip',
      remoteAddress: '10.0.0.5',
      headers: { 'x-forwarded-for': '198.51.100.7, 203.0.113.9' },
    });
    await app.close();
    // Rightmost entry was appended by our proxy; the leftmost is attacker-controlled.
    expect((res.json() as { ip: string }).ip).toBe('203.0.113.9');
  });

  it('ignores X-Forwarded-For from an address outside the trusted proxies', async () => {
    expect(await clientIpBehind(resolveTrustProxy({ IRP_TRUST_PROXY: '192.168.0.0/16' }))).toBe(
      '10.0.0.5',
    );
  });
});
