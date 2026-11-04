import { describe, expect, it } from 'vitest';
import { evaluateGatewayHealth, probeGatewayHealth } from './health.js';

describe('gateway health', () => {
  it('scores a reachable low-latency gateway as healthy when protocol evidence exists', () => {
    const checkedAt = '2026-08-24T00:00:00.000Z';
    const result = evaluateGatewayHealth(
      {
        gatewayId: 'gw-1',
        checkedAt,
        reachable: true,
        evidence: 'protocol',
        latencyMs: 40,
        packetLossPercent: 0,
      },
      Date.parse(checkedAt) + 1_000,
    );

    expect(result.status).toBe('healthy');
    expect(result.score).toBe(100);
    expect(result.evidence).toBe('protocol');
  });

  it('never reports transport-only evidence as healthy', () => {
    const checkedAt = '2026-08-24T00:00:00.000Z';
    const result = evaluateGatewayHealth(
      {
        gatewayId: 'gw-1',
        checkedAt,
        reachable: true,
        evidence: 'transport',
        latencyMs: 40,
        packetLossPercent: 0,
      },
      Date.parse(checkedAt) + 1_000,
    );

    expect(result.status).not.toBe('healthy');
    expect(result.status).toBe('degraded');
    expect(result.score).toBeLessThan(80);
    expect(result.reason).toContain('not operational');
  });

  it('treats absent evidence as transport evidence and fails closed', () => {
    const checkedAt = '2026-08-24T00:00:00.000Z';
    const result = evaluateGatewayHealth(
      { gatewayId: 'gw-1', checkedAt, reachable: true, latencyMs: 40, packetLossPercent: 0 },
      Date.parse(checkedAt) + 1_000,
    );

    expect(result.status).not.toBe('healthy');
    expect(result.status).toBe('degraded');
    expect(result.evidence).toBe('transport');
  });

  it('treats egress evidence as the strongest evidence', () => {
    const checkedAt = '2026-08-24T00:00:00.000Z';
    const result = evaluateGatewayHealth(
      {
        gatewayId: 'gw-1',
        checkedAt,
        reachable: true,
        evidence: 'egress',
        latencyMs: 40,
        packetLossPercent: 0,
      },
      Date.parse(checkedAt) + 1_000,
    );

    expect(result.status).toBe('healthy');
    expect(result.evidence).toBe('egress');
    expect(result.reason).toContain('egress');
  });

  it('reports a probe that cannot speak the transport as unknown, not unreachable', () => {
    const checkedAt = '2026-08-24T00:00:00.000Z';
    const result = evaluateGatewayHealth(
      {
        gatewayId: 'gw-1',
        checkedAt,
        reachable: false,
        applicable: false,
        evidence: 'transport',
      },
      Date.parse(checkedAt) + 1_000,
    );

    expect(result.status).toBe('unknown');
    expect(result.reason).toContain('not applicable');
  });

  it('marks unreachable and stale samples explicitly', () => {
    const checkedAt = '2026-08-24T00:00:00.000Z';
    expect(
      evaluateGatewayHealth(
        { gatewayId: 'gw-1', checkedAt, reachable: false },
        Date.parse(checkedAt) + 1_000,
      ).status,
    ).toBe('unreachable');

    expect(
      evaluateGatewayHealth(
        { gatewayId: 'gw-1', checkedAt, reachable: true, latencyMs: 10 },
        Date.parse(checkedAt) + 61_000,
      ).status,
    ).toBe('stale');
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
      {
        gatewayId: 'gw-1',
        checkedAt,
        reachable: true,
        evidence: 'protocol',
        latencyMs: 250,
        packetLossPercent: 4,
      },
      Date.parse(checkedAt) + 1_000,
    );

    expect(result.status).toBe('degraded');
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(80);
  });

  it('rejects an unknown evidence kind', () => {
    const checkedAt = '2026-08-24T00:00:00.000Z';
    expect(() =>
      evaluateGatewayHealth(
        {
          gatewayId: 'gw-1',
          checkedAt,
          reachable: true,
          evidence: 'magic' as never,
        },
        Date.parse(checkedAt) + 1_000,
      ),
    ).toThrow('evidence must be one of');
  });

  it('enforces a hard probe timeout', async () => {
    await expect(
      probeGatewayHealth(
        'gw-1',
        { host: 'gateway.example.test', port: 443, family: 'dual' },
        { probe: () => new Promise(() => undefined) },
        10,
      ),
    ).rejects.toThrow('timed out');
  });

  it('propagates the evidence a probe reported', async () => {
    const sample = await probeGatewayHealth(
      'gw-1',
      { host: 'gateway.example.test', port: 443, family: 'dual' },
      { probe: async () => ({ reachable: true, evidence: 'protocol' as const }) },
      1_000,
    );

    expect(sample.evidence).toBe('protocol');
  });

  it('defaults a probe that reports no evidence to transport', async () => {
    const sample = await probeGatewayHealth(
      'gw-1',
      { host: 'gateway.example.test', port: 443, family: 'dual' },
      { probe: async () => ({ reachable: true }) },
      1_000,
    );

    expect(sample.evidence).toBe('transport');
  });
});
