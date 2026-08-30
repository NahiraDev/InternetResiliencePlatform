import { describe, expect, it } from 'vitest';
import { CaptivePortalMetric } from './CaptivePortalMetric.js';
import type { HTTPProvider } from '../providers/HTTPProvider.js';
const provider = (statusCode: number): HTTPProvider => ({
  request: async () => ({ responseMs: 10, statusCode, bytes: 0 }),
  tlsHandshake: async () => ({ handshakeMs: 10, authorized: true }),
  publicIp: async () => ({ ip: null, asn: null, isp: null }),
  bandwidth: async () => ({ mbps: 1 }),
});
describe('CaptivePortalMetric', () => {
  it('flags redirects as captive-portal signals', async () => {
    await expect(new CaptivePortalMetric(provider(302), 'http://probe.local').measure(new AbortController().signal)).resolves.toEqual({ captive: true, redirected: true, statusCode: 302 });
  });
  it('does not flag a normal response', async () => {
    await expect(new CaptivePortalMetric(provider(204), 'http://probe.local').measure(new AbortController().signal)).resolves.toEqual({ captive: false, redirected: false, statusCode: 204 });
  });
});
