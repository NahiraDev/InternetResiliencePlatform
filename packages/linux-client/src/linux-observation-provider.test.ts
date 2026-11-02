import { describe, expect, it, vi } from 'vitest';
import type { ConnectivityManager } from '@irp/connectivity';
import { LinuxObservationProvider } from './linux-observation-provider.js';

describe.skipIf(process.platform !== 'linux')('LinuxObservationProvider', () => {
  it('turns provider health measurements into canonical network observations', async () => {
    const source = {
      id: 'resource-eth0', sourceId: 'eth0', providerId: 'linux-host',
      interfaceName: 'eth0', gateway: '192.0.2.1', available: true,
    };
    const health = {
      score: 96, status: 'healthy', latencyMs: 18, packetLoss: 0,
      jitterMs: 2, internetReachable: true, dnsReachable: true,
      gatewayReachable: true, ipv4: true, ipv6: false,
    };
    const manager = {
      discoverResources: vi.fn(async () => undefined),
      getAvailableSources: () => [source],
      getActiveSource: () => source,
      registry: { get: () => ({ getHealth: async () => health }) },
    } as unknown as ConnectivityManager;
    const observer = new LinuxObservationProvider(manager, { dedupTtlMs: 60_000 });
    const result = await observer.collect({ correlationId: 'linux-observer-test' } as never);
    expect(result.errors).toEqual([]);
    expect(result.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: 'quality_score', value: 96 }),
      expect.objectContaining({ metric: 'latency_ms', value: 18 }),
      expect.objectContaining({ metric: 'packet_loss', value: 0 }),
      expect.objectContaining({ metric: 'dns_reachable', value: 1 }),
      expect.objectContaining({ metric: 'ipv4_available', value: 1 }),
      expect.objectContaining({ metric: 'ipv6_available', value: 0 }),
      expect.objectContaining({ metric: 'internet_connectivity', value: 1 }),
    ]));
  });
});
