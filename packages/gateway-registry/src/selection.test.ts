import { describe, expect, it } from 'vitest';
import { evaluateGatewayHealth, type GatewayHealth } from './health.js';
import { type GatewayMetadata } from './index.js';
import { selectGateway } from './selection.js';

const gateway = (id: string, overrides: Partial<GatewayMetadata> = {}): GatewayMetadata => ({
  id,
  name: `Gateway ${id}`,
  endpoint: { host: `${id}.example.test`, port: 51820, family: 'dual' },
  ownership: { ownerId: 'owner-1', managedBy: 'control-plane' },
  capabilities: {
    tunnelProtocols: ['wireguard', 'openvpn'],
    addressFamilies: ['dual'],
    transports: ['udp'],
    features: ['health-check'],
  },
  lifecycle: 'active',
  trust: 'trusted',
  tags: ['prod'],
  createdAt: '2026-08-25T00:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
  ...overrides,
});

const health = (gatewayId: string, score: number, latencyMs: number, checkedAt = '2026-08-25T12:00:00.000Z'): GatewayHealth => ({
  gatewayId,
  status: score >= 80 ? 'healthy' : 'degraded',
  score,
  checkedAt,
  latencyMs,
  packetLossPercent: 1,
  reason: 'test evidence',
});

describe('selectGateway', () => {
  it('selects the highest quality eligible gateway using health and capacity evidence', () => {
    const result = selectGateway({
      gateways: [gateway('gw-a', { region: 'ir-central' }), gateway('gw-b', { region: 'ir-west' })],
      health: new Map([
        ['gw-a', health('gw-a', 88, 80)],
        ['gw-b', health('gw-b', 96, 50)],
      ]),
      capacity: new Map([
        ['gw-a', { utilizationPercent: 40, checkedAt: '2026-08-25T12:00:00.000Z' }],
        ['gw-b', { utilizationPercent: 30, checkedAt: '2026-08-25T12:00:00.000Z' }],
      ]),
      now: new Date('2026-08-25T12:00:30.000Z'),
    });

    expect(result.selected?.gateway.id).toBe('gw-b');
    expect(result.selected?.eligible).toBe(true);
    expect(result.selected?.scoreComponents.health).toBe(96);
  });

  it('rejects gateways that violate trust, lifecycle, health, capacity and policy constraints', () => {
    const result = selectGateway({
      gateways: [
        gateway('disabled', { lifecycle: 'disabled' }),
        gateway('untrusted', { trust: 'pending' }),
        gateway('overloaded', { region: 'ir-central' }),
        gateway('wrong-region', { region: 'eu-west' }),
      ],
      health: new Map([
        ['disabled', health('disabled', 99, 20)],
        ['untrusted', health('untrusted', 99, 20)],
        ['overloaded', health('overloaded', 99, 20)],
        ['wrong-region', health('wrong-region', 99, 20)],
      ]),
      capacity: new Map([
        ['disabled', { utilizationPercent: 10, checkedAt: '2026-08-25T12:00:00.000Z' }],
        ['untrusted', { utilizationPercent: 10, checkedAt: '2026-08-25T12:00:00.000Z' }],
        ['overloaded', { utilizationPercent: 95, checkedAt: '2026-08-25T12:00:00.000Z' }],
        ['wrong-region', { utilizationPercent: 10, checkedAt: '2026-08-25T12:00:00.000Z' }],
      ]),
      policy: { allowedRegions: ['ir-central'] },
      now: new Date('2026-08-25T12:00:30.000Z'),
    });

    expect(result.selected).toBeUndefined();
    expect(result.candidates.map((candidate) => candidate.rejectionReason)).toEqual([
      'not-active',
      'not-trusted',
      'capacity-limit',
      'region-not-allowed',
    ]);
  });

  it('enforces required tags, tunnel protocol and address family', () => {
    const result = selectGateway({
      gateways: [
        gateway('missing-tag'),
        gateway('missing-protocol', { capabilities: { tunnelProtocols: ['openvpn'], addressFamilies: ['dual'], transports: ['tcp'], features: [] } }),
        gateway('missing-family', { capabilities: { tunnelProtocols: ['wireguard'], addressFamilies: ['ipv4'], transports: ['udp'], features: [] } }),
      ],
      health: {
        'missing-tag': health('missing-tag', 95, 40),
        'missing-protocol': health('missing-protocol', 95, 40),
        'missing-family': health('missing-family', 95, 40),
      },
      policy: { requiredTags: ['trusted-egress'], requiredTunnelProtocol: 'wireguard', requiredAddressFamily: 'ipv6' },
      now: new Date('2026-08-25T12:00:30.000Z'),
    });

    expect(result.selected).toBeUndefined();
    expect(result.candidates.every((candidate) => candidate.eligible === false)).toBe(true);
  });

  it('keeps a healthy current gateway when the challenger does not clear hysteresis', () => {
    const result = selectGateway({
      gateways: [gateway('current'), gateway('challenger')],
      health: {
        current: health('current', 90, 60),
        challenger: health('challenger', 92, 55),
      },
      currentGatewayId: 'current',
      policy: { hysteresisScore: 10 },
      now: new Date('2026-08-25T12:00:30.000Z'),
    });

    expect(result.selected?.gateway.id).toBe('current');
    expect(result.switched).toBe(false);
    expect(result.selected?.explanation.at(-1)).toContain('hysteresis');
  });

  it('switches when a challenger clears hysteresis and deterministically breaks ties by id', () => {
    const result = selectGateway({
      gateways: [gateway('gw-b'), gateway('gw-a')],
      health: {
        'gw-a': health('gw-a', 95, 50),
        'gw-b': health('gw-b', 95, 50),
      },
      currentGatewayId: 'gw-b',
      policy: { hysteresisScore: 0 },
      now: new Date('2026-08-25T12:00:30.000Z'),
    });

    expect(result.selected?.gateway.id).toBe('gw-a');
    expect(result.switched).toBe(true);
  });

  it('rejects stale health evidence instead of making a decision from old measurements', () => {
    const stale = health('gw-a', 100, 10, '2026-08-25T10:00:00.000Z');
    const result = selectGateway({
      gateways: [gateway('gw-a')],
      health: { 'gw-a': stale },
      now: new Date('2026-08-25T12:00:30.000Z'),
    });

    expect(result.selected).toBeUndefined();
    expect(result.candidates[0]?.rejectionReason).toBe('stale-health');
  });

  it('does not mutate gateway or evidence inputs', () => {
    const gateways = [gateway('gw-a', { tags: ['prod'] })];
    const healthEvidence = { 'gw-a': health('gw-a', 90, 50) };
    const capacity = { 'gw-a': { utilizationPercent: 20, checkedAt: '2026-08-25T12:00:00.000Z' } };
    const before = JSON.stringify({ gateways, healthEvidence, capacity });

    selectGateway({ gateways, health: healthEvidence, capacity, now: new Date('2026-08-25T12:00:30.000Z') });

    expect(JSON.stringify({ gateways, healthEvidence, capacity })).toBe(before);
  });

  it('retains explicit health classification semantics from the health engine', () => {
    const evaluated = evaluateGatewayHealth(
      { gatewayId: 'gw-a', checkedAt: '2026-08-25T12:00:00.000Z', reachable: true, latencyMs: 80, packetLossPercent: 1 },
      Date.parse('2026-08-25T12:00:30.000Z'),
    );
    expect(evaluated.status).toBe('healthy');
    expect(evaluated.score).toBeGreaterThanOrEqual(80);
  });
});
