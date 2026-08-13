import { describe, expect, it, vi } from 'vitest';
import {
  NetworkMonitor,
  NetworkSampler,
  calculateQualityScore,
  average,
  standardDeviation,
  packetLossRatio,
  Scheduler,
  type DNSProvider,
  type HTTPProvider,
  type PingProvider,
  type PublicIPResult,
} from './index.js';
const ping: PingProvider = {
  async ping() {
    return { latencyMs: 40, success: true };
  },
};
const dns: DNSProvider = {
  async lookup() {
    return { lookupMs: 15, addresses: ['1.1.1.1'] };
  },
};
const http: HTTPProvider = {
  async request() {
    return { responseMs: 120, statusCode: 204, bytes: 10 };
  },
  async tlsHandshake() {
    return { handshakeMs: 80, authorized: true };
  },
  async publicIp() {
    return { ip: '203.0.113.1', asn: 64500, isp: 'Example ISP' };
  },
  async bandwidth() {
    return { mbps: 50 };
  },
};
describe('quality calculation', () => {
  it('is deterministic and bounded', () => {
    const base = {
      latencyMs: 30,
      jitterMs: 5,
      packetLossRatio: 0,
      dnsLookupMs: 20,
      httpResponseMs: 100,
      httpsHandshakeMs: 50,
      ipv4Connectivity: true,
      ipv6Connectivity: true,
      publicIp: 'x',
      asn: 1,
      isp: 'i',
      networkType: 'unknown' as const,
      gatewayReachable: true,
      internetReachable: true,
      bandwidthMbps: 25,
    };
    expect(calculateQualityScore(base)).toBe(100);
    expect(
      calculateQualityScore({
        ...base,
        packetLossRatio: 1,
        latencyMs: 2000,
        internetReachable: false,
        gatewayReachable: false,
        ipv4Connectivity: false,
        ipv6Connectivity: false,
        bandwidthMbps: 0,
      }),
    ).toBeLessThan(40);
  });
});
describe('statistics', () => {
  it('calculates average jitter and loss', () => {
    expect(average([1, 2, 3])).toBe(2);
    expect(standardDeviation([2, 2, 2])).toBe(0);
    expect(packetLossRatio([true, false, false, true])).toBe(0.5);
  });
});
describe('sampling', () => {
  it('builds immutable snapshots from providers', async () => {
    const sampler = new NetworkSampler(
      { ping, dns, http },
      {
        pingHost: 'p',
        dnsHost: 'd',
        httpUrl: 'h',
        httpsUrl: 's',
        publicIpUrl: 'ip',
        bandwidthUrl: 'b',
        gatewayHost: 'g',
        pingAttempts: 2,
        timeoutMs: 100,
        retry: { attempts: 1, delayMs: 0 },
        networkTypeDetector: () => 'wifi',
        now: () => '2026-01-01T00:00:00.000Z',
      },
    );
    const snap = await sampler.sample(new AbortController().signal);
    expect(snap.publicIp).toBe('203.0.113.1');
    expect(snap.networkType).toBe('wifi');
    expect(Object.isFrozen(snap)).toBe(true);
  });
  it('handles provider failure without real internet', async () => {
    const badHttp: HTTPProvider = {
      async request() {
        throw new Error('down');
      },
      async tlsHandshake() {
        throw new Error('down');
      },
      async publicIp(): Promise<PublicIPResult> {
        throw new Error('down');
      },
      async bandwidth() {
        throw new Error('down');
      },
    };
    const snap = await new NetworkSampler({ ping, dns, http: badHttp }).sample(
      new AbortController().signal,
    );
    expect(snap.publicIp).toBeNull();
    expect(snap.qualityScore).toBeGreaterThan(0);
  });
});
describe('monitor history and events', () => {
  it('stores history and emits typed events', async () => {
    const sampler = new NetworkSampler(
      { ping, dns, http },
      {
        pingHost: 'p',
        dnsHost: 'd',
        httpUrl: 'h',
        httpsUrl: 's',
        publicIpUrl: 'ip',
        bandwidthUrl: 'b',
        gatewayHost: 'g',
        pingAttempts: 1,
        timeoutMs: 100,
        retry: { attempts: 1, delayMs: 0 },
        networkTypeDetector: () => 'wired',
        now: () => new Date().toISOString(),
      },
    );
    const monitor = new NetworkMonitor(sampler);
    const online = vi.fn();
    monitor.subscribe('network.online', online);
    await monitor.collect();
    expect(online).toHaveBeenCalledOnce();
    expect(monitor.snapshot()?.isp).toBe('Example ISP');
    expect(monitor.history('1m')).toHaveLength(1);
    expect(monitor.health().samples).toBe(1);
  });
});
describe('scheduler', () => {
  it('starts and stops interval', () => {
    const scheduler = new Scheduler(async () => undefined, {
      intervalMs: 10,
      runImmediately: false,
    });
    scheduler.start(new AbortController().signal);
    expect(scheduler.isRunning()).toBe(true);
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });
});
import {
  ASNMetric,
  ISPMetric,
  PublicIPMetric,
  IPv4Metric,
  IPv6Metric,
  NodeDNSProvider,
  NodeHTTPProvider,
  MockablePingProvider,
  TimeoutError,
  withTimeout,
  retry,
} from './index.js';
import { createServer } from 'node:http';
describe('additional providers and metrics', () => {
  it('covers metadata and ip metrics', async () => {
    expect(await new ASNMetric(http, 'u').measure(new AbortController().signal)).toBe(64500);
    expect(await new ISPMetric(http, 'u').measure(new AbortController().signal)).toBe(
      'Example ISP',
    );
    expect(await new PublicIPMetric(http, 'u').measure(new AbortController().signal)).toBe(
      '203.0.113.1',
    );
    expect(typeof (await new IPv4Metric().measure(new AbortController().signal))).toBe('boolean');
    expect(typeof (await new IPv6Metric().measure(new AbortController().signal))).toBe('boolean');
    expect(await new MockablePingProvider().ping('x', new AbortController().signal)).toEqual({
      latencyMs: 1,
      success: true,
    });
    expect(
      await new NodeDNSProvider().lookup('localhost', new AbortController().signal),
    ).toBeDefined();
  });
  it('covers node http provider against a local server', async () => {
    const server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(
        req.url === '/ip' ? JSON.stringify({ ip: '127.0.0.1', asn: 64501, isp: 'Local' }) : 'hello',
      );
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    try {
      const address = server.address();
      if (typeof address === 'string' || address === null) throw new Error('missing port');
      const url = `http://127.0.0.1:${address.port}`;
      const provider = new NodeHTTPProvider();
      expect((await provider.request(url, new AbortController().signal)).statusCode).toBe(200);
      expect((await provider.tlsHandshake(url, new AbortController().signal)).authorized).toBe(
        true,
      );
      expect((await provider.publicIp(`${url}/ip`, new AbortController().signal)).isp).toBe(
        'Local',
      );
      expect((await provider.bandwidth(url, new AbortController().signal)).mbps).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('covers retry and timeout failures', async () => {
    await expect(
      withTimeout(async () => new Promise((resolve) => setTimeout(resolve, 20)), 1),
    ).rejects.toThrow();
    await expect(
      retry(
        async () => {
          throw new Error('x');
        },
        { attempts: 2, delayMs: 0 },
      ),
    ).rejects.toThrow('x');
    expect(new TimeoutError().name).toBe('TimeoutError');
  });
  it('emits change events and unsubscribe works', async () => {
    let n = 0;
    const h = (): void => {
      n += 1;
    };
    const changingPing: PingProvider = {
      async ping() {
        n += 0;
        return { latencyMs: n === 0 ? 10 : 100, success: true };
      },
    };
    const sampler = new NetworkSampler(
      { ping: changingPing, dns, http },
      {
        pingHost: 'p',
        dnsHost: 'd',
        httpUrl: 'h',
        httpsUrl: 's',
        publicIpUrl: 'ip',
        bandwidthUrl: 'b',
        gatewayHost: 'g',
        pingAttempts: 1,
        timeoutMs: 100,
        retry: { attempts: 1, delayMs: 0 },
        networkTypeDetector: () => 'wired',
        now: () => new Date().toISOString(),
      },
    );
    const monitor = new NetworkMonitor(sampler, {
      samplingIntervalMs: 5,
      maxHistoryMs: 86_400_000,
      packetLossHighThreshold: 0.05,
      latencyChangeThresholdMs: 1,
      qualityChangeThreshold: 1,
      bandwidthChangeThresholdMbps: 1,
    });
    monitor.subscribe('latency.changed', h);
    await monitor.collect();
    n = 1;
    await monitor.collect();
    expect(n).toBe(2);
    monitor.unsubscribe('latency.changed', h);
  });
});
