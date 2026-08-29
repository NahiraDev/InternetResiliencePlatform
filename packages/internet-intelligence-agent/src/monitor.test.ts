import { describe, expect, it, vi } from 'vitest';
import { InternetIntelligenceAgent } from './agent.js';
import { InternetIntelligenceMonitor } from './monitor.js';
import type { InternetEvidence } from './types.js';

const evidence: InternetEvidence = {
  timestamp: '2026-08-29T19:00:00.000Z', latencyMs: 40, jitterMs: 3, packetLossRatio: 0,
  dnsLookupMs: 30, httpResponseMs: 80, httpsHandshakeMs: 50, ipv4Connectivity: true,
  ipv6Connectivity: true, gatewayReachable: true, internetReachable: true, qualityScore: 95,
};

describe('InternetIntelligenceMonitor', () => {
  it('analyzes an existing evidence source and emits the recommendation', async () => {
    const source = { read: vi.fn(async () => evidence) };
    const onRecommendation = vi.fn();
    const monitor = new InternetIntelligenceMonitor(source, new InternetIntelligenceAgent(), { onRecommendation });
    const result = await monitor.runOnce();
    expect(result?.diagnosis).toBe('healthy');
    expect(source.read).toHaveBeenCalledTimes(1);
    expect(onRecommendation).toHaveBeenCalledTimes(1);
  });

  it('serializes overlapping runs instead of launching duplicate analysis', async () => {
    let release!: () => void;
    const source = { read: vi.fn(() => new Promise<InternetEvidence>((resolve) => { release = () => resolve(evidence); })) };
    const monitor = new InternetIntelligenceMonitor(source, new InternetIntelligenceAgent());
    const first = monitor.runOnce();
    const second = await monitor.runOnce();
    expect(second).toBeNull();
    release();
    await expect(first).resolves.toMatchObject({ diagnosis: 'healthy' });
    expect(source.read).toHaveBeenCalledTimes(1);
  });

  it('does not propagate evidence-source failures', async () => {
    const monitor = new InternetIntelligenceMonitor({ read: async () => { throw new Error('probe unavailable'); } });
    await expect(monitor.runOnce()).resolves.toBeNull();
  });

  it('stops scheduled work cleanly', async () => {
    vi.useFakeTimers();
    try {
      const source = { read: vi.fn(async () => evidence) };
      const monitor = new InternetIntelligenceMonitor(source, new InternetIntelligenceAgent(), { intervalMs: 1_000, runImmediately: false });
      monitor.start();
      await vi.advanceTimersByTimeAsync(1_000);
      monitor.stop();
      await vi.advanceTimersByTimeAsync(3_000);
      expect(source.read).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
