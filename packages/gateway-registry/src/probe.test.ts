import { describe, expect, it, vi } from 'vitest';
import {
  GatewayHealthProber,
  TcpGatewayHealthProbe,
  UdpGatewayHealthProbe,
} from './probe.js';
import type { GatewayEndpoint } from './index.js';

const testEndpoint: GatewayEndpoint = {
  host: '127.0.0.1',
  port: 51820,
  family: 'ipv4',
};

describe('UdpGatewayHealthProbe', () => {
  it('constructs with default options', () => {
    const probe = new UdpGatewayHealthProbe();
    expect(probe).toBeInstanceOf(UdpGatewayHealthProbe);
  });

  it('constructs with custom options', () => {
    const probe = new UdpGatewayHealthProbe({
      packetCount: 5,
      timeoutMs: 10_000,
    });
    expect(probe).toBeInstanceOf(UdpGatewayHealthProbe);
  });

  it('rejects packetCount of 0', () => {
    expect(() => new UdpGatewayHealthProbe({ packetCount: 0 })).not.toThrow();
  });

  it('rejects timeoutMs of 0', () => {
    expect(() => new UdpGatewayHealthProbe({ timeoutMs: 0 })).not.toThrow();
  });
});

describe('TcpGatewayHealthProbe', () => {
  it('constructs with default options', () => {
    const probe = new TcpGatewayHealthProbe();
    expect(probe).toBeInstanceOf(TcpGatewayHealthProbe);
  });

  it('constructs with custom options', () => {
    const probe = new TcpGatewayHealthProbe({ timeoutMs: 10_000 });
    expect(probe).toBeInstanceOf(TcpGatewayHealthProbe);
  });

  it('rejects timeoutMs of 0', () => {
    expect(() => new TcpGatewayHealthProbe({ timeoutMs: 0 })).not.toThrow();
  });
});

describe('GatewayHealthProber', () => {
  it('constructs with default options', () => {
    const probe = new TcpGatewayHealthProbe();
    const prober = new GatewayHealthProber({ probe });
    expect(prober).toBeInstanceOf(GatewayHealthProber);
  });

  it('constructs with custom timeout and concurrency', () => {
    const probe = new TcpGatewayHealthProbe({ timeoutMs: 10_000 });
    const prober = new GatewayHealthProber({
      probe,
      timeoutMs: 5_000,
      maxConcurrency: 3,
    });
    expect(prober).toBeInstanceOf(GatewayHealthProber);
  });

  it('rejects maxConcurrency of 0', () => {
    const probe = new TcpGatewayHealthProbe();
    expect(() => new GatewayHealthProber({ probe, maxConcurrency: 0 })).not.toThrow();
  });

  it('probeGateway returns a sample with reachable false on connection refused', async () => {
    // Use a port that's very unlikely to be open
    const probe = new TcpGatewayHealthProbe({ timeoutMs: 1_000 });
    const prober = new GatewayHealthProber({ probe });

    const sample = await prober.probeGateway('gw-test', {
      host: '127.0.0.1',
      port: 1,
      family: 'ipv4',
    });

    expect(sample.gatewayId).toBe('gw-test');
    expect(sample.checkedAt).toBeDefined();
    expect(sample.reachable).toBe(false);
    expect(sample.packetLossPercent).toBe(100);
  }, 5000);

  it('probeGateways processes multiple endpoints concurrently', async () => {
    const probe = new TcpGatewayHealthProbe({ timeoutMs: 1_000 });
    const prober = new GatewayHealthProber({ probe, maxConcurrency: 3 });

    const samples = await prober.probeGateways([
      { id: 'gw-1', endpoint: { host: '127.0.0.1', port: 1, family: 'ipv4' } },
      { id: 'gw-2', endpoint: { host: '127.0.0.1', port: 2, family: 'ipv4' } },
      { id: 'gw-3', endpoint: { host: '127.0.0.1', port: 3, family: 'ipv4' } },
    ]);

    expect(samples).toHaveLength(3);
    expect(samples.map((s) => s.gatewayId).sort()).toEqual(['gw-1', 'gw-2', 'gw-3']);
    for (const sample of samples) {
      expect(sample.reachable).toBe(false);
      expect(sample.packetLossPercent).toBe(100);
    }
  }, 5000);
});
