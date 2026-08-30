import { readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
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

it('emits offline and threshold events, prunes stale history, and reports running health', async () => {
  const oldTimestamp = new Date(Date.now() - 10_000).toISOString();
  const freshTimestamp = new Date().toISOString();
  let sample = 0;
  const dynamicPing: PingProvider = {
    async ping(host) {
      if (host === 'g') return { latencyMs: 5, success: sample !== 1 };
      return { latencyMs: sample === 0 ? 10 : 80, success: sample !== 1 };
    },
  };
  const dynamicHttp: HTTPProvider = {
    async request() {
      return {
        responseMs: sample === 0 ? 50 : 200,
        statusCode: sample === 1 ? 503 : 204,
        bytes: 10,
      };
    },
    async tlsHandshake() {
      return { handshakeMs: 20, authorized: true };
    },
    async publicIp() {
      return { ip: sample === 0 ? '203.0.113.1' : '203.0.113.2', asn: 64500, isp: 'Example ISP' };
    },
    async bandwidth() {
      return { mbps: sample === 0 ? 50 : 5 };
    },
  };
  const sampler = new NetworkSampler(
    { ping: dynamicPing, dns, http: dynamicHttp },
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
      networkTypeDetector: () => 'wired',
      now: () => (sample === 0 ? oldTimestamp : freshTimestamp),
    },
  );
  const monitor = new NetworkMonitor(sampler, {
    samplingIntervalMs: 1_000,
    maxHistoryMs: 1_000,
    packetLossHighThreshold: 0.1,
    latencyChangeThresholdMs: 1,
    qualityChangeThreshold: 1,
    bandwidthChangeThresholdMbps: 1,
  });
  const offline = vi.fn();
  const loss = vi.fn();
  const publicIp = vi.fn();
  const gateway = vi.fn();
  const bandwidth = vi.fn();
  monitor.subscribe('network.offline', offline);
  monitor.subscribe('packetloss.high', loss);
  monitor.subscribe('publicip.changed', publicIp);
  monitor.subscribe('gateway.changed', gateway);
  monitor.subscribe('bandwidth.changed', bandwidth);
  await monitor.collect();
  sample = 1;
  await monitor.collect();
  expect(offline).toHaveBeenCalledOnce();
  expect(monitor.history('24h')).toHaveLength(1);
});

it('reports running health while started and stops cleanly', () => {
  const monitor = new NetworkMonitor(
    new NetworkSampler(
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
        now: () => new Date().toISOString(),
        networkTypeDetector: () => 'unknown',
      },
    ),
  );
  monitor.start();
  monitor.start();
  expect(monitor.health().running).toBe(true);
  expect(monitor.health().latest).toBeUndefined();
  monitor.stop();
  expect(monitor.health().running).toBe(false);
});

describe('scheduler', () => {
  it('runs immediately, suppresses overlapping scheduler executions, and supports restart', async () => {
    vi.useFakeTimers();
    try {
      let release: (() => void) | undefined;
      const task = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      const scheduler = new Scheduler(task, { intervalMs: 10, runImmediately: true });
      scheduler.start(new AbortController().signal);
      scheduler.start(new AbortController().signal);
      expect(task).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(30);
      expect(task).toHaveBeenCalledOnce();
      release?.();
      await vi.runOnlyPendingTimersAsync();
      scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
      scheduler.start(new AbortController().signal);
      expect(scheduler.isRunning()).toBe(true);
      scheduler.stop();
    } finally {
      vi.useRealTimers();
    }
  });
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

  it('covers node http provider against local HTTP and HTTPS servers', async () => {
    const httpServer = createHttpServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(
        req.url === '/ip'
          ? JSON.stringify({ ip: '127.0.0.1', asn: 64501, org: 'Local Org' })
          : 'hello',
      );
    });
    const httpsServer = createHttpsServer(
      {
        key: readFileSync(new URL('./providers/__fixtures__/localhost-test-key.pem', import.meta.url)),
        cert: readFileSync(new URL('./providers/__fixtures__/localhost-test-cert.pem', import.meta.url)),
      },
      (_req, res) => res.end('hello over tls'),
    );

    await Promise.all([
      new Promise<void>((resolve) => httpServer.listen(0, resolve)),
      new Promise<void>((resolve) => httpsServer.listen(0, resolve)),
    ]);

    try {
      const httpAddress = httpServer.address();
      const httpsAddress = httpsServer.address();
      if (
        typeof httpAddress === 'string' ||
        httpAddress === null ||
        typeof httpsAddress === 'string' ||
        httpsAddress === null
      ) {
        throw new Error('missing test server port');
      }

      const httpUrl = `http://127.0.0.1:${httpAddress.port}`;
      const httpsUrl = `https://127.0.0.1:${httpsAddress.port}`;
      const provider = new NodeHTTPProvider();
      expect((await provider.request(httpUrl, new AbortController().signal)).statusCode).toBe(200);
      const tls = await provider.tlsHandshake(httpsUrl, new AbortController().signal);
      expect(tls.handshakeMs).toBeGreaterThanOrEqual(0);
      expect(tls.authorized).toBe(false);
      await expect(
        provider.tlsHandshake(httpUrl, new AbortController().signal),
      ).rejects.toThrow('TLS handshake requires an https URL');
      expect((await provider.publicIp(`${httpUrl}/ip`, new AbortController().signal)).isp).toBe(
        'Local Org',
      );
      expect((await provider.bandwidth(httpUrl, new AbortController().signal)).mbps).toBeGreaterThan(0);
    } finally {
      await Promise.all([
        new Promise<void>((resolve) => httpServer.close(() => resolve())),
        new Promise<void>((resolve) => httpsServer.close(() => resolve())),
      ]);
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

    const controller = new AbortController();
    const delayed = retry(
      async () => {
        throw new Error('delayed');
      },
      { attempts: 2, delayMs: 100 },
      controller.signal,
    );
    controller.abort();
    await expect(delayed).rejects.toThrow('Operation aborted');
    await expect(
      retry(
        async () => {
          throw 'plain';
        },
        { attempts: 1, delayMs: 0 },
      ),
    ).rejects.toThrow('plain');
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
