import { describe, expect, it } from 'vitest';
import { evaluateGatewayHealth, probeGatewayHealth } from './health.js';

describe('gateway health', () => {
  it('scores a reachable low-latency gateway as healthy', () => {
    const checkedAt = '2026-08-24T00:00:00.000Z';
    const result = evaluateGatewayHealth(
      { gatewayId: 'gw-1', checkedAt, reachable: true, latencyMs: 40, packetLossPercent: 0 },
      Date.parse(checkedAt) + 1_000,
    );

    expect(result.status).toBe('healthy');
    expect(result.score).toBe(100);
  });

  it('marks unreachable and stale samples explicitly', () => {
    const checkedAt = '2026-08-24T00:00:00.000Z';
    expect(evaluateGatewayHealth(
      { gatewayId: 'gw-1', checkedAt, reachable: false },
      Date.parse(checkedAt) + 1_000,
    ).status).toBe('unreachable');

    expect(evaluateGatewayHealth(
      { gatewayId: 'gw-1', checkedAt, reachable: true, latencyMs: 10 },
      Date.parse(checkedAt) + 61_000,
    ).status).toBe('stale');
  });

  it('does not manufacture quality from reachability alone', () => {
    const checkedAt = '2026-08-24T00:00:00.000Z';
    const result = evaluateGatewayHealth(
      { gatewayId: 'gw-1', checkedAt, reachable: true },
      Date.parse(checkedAt) + 1_000,
    );

    expect(result.status).toBe('unknown');
    expect(result.score).toBe(50);
  });

  it('classifies degraded quality deterministically', () => {
    const checkedAt = '2026-08-24T00:00:00.000Z';
    const result = evaluateGatewayHealth(
      { gatewayId: 'gw-1', checkedAt, reachable: true, latencyMs: 250, packetLossPercent: 4 },
      Date.parse(checkedAt) + 1_000,
    );

    expect(result.status).toBe('degraded');
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(80);
  });

  it('enforces a hard probe timeout', async () => {
    await expect(probeGatewayHealth(
      'gw-1',
      { host: 'gateway.example.test', port: 443, family: 'dual' },
      { probe: () => new Promise(() => undefined) },
      10,
    )).rejects.toThrow('timed out');
  });
});
