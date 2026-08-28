import { describe, expect, it, vi } from 'vitest';
import type { GatewayHealth } from './health.js';
import type { GatewayMetadata } from './index.js';
import { MultiGatewayFailover } from './failover.js';

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
  createdAt: '2026-08-28T00:00:00.000Z',
  updatedAt: '2026-08-28T00:00:00.000Z',
  ...overrides,
});

const health = (
  gatewayId: string,
  score: number,
  latencyMs: number,
  status: GatewayHealth['status'] = score >= 80 ? 'healthy' : 'degraded',
): GatewayHealth => ({
  gatewayId,
  status,
  score,
  checkedAt: '2026-08-28T11:00:00.000Z',
  latencyMs,
  packetLossPercent: 1,
  reason: 'test evidence',
});

describe('MultiGatewayFailover', () => {
  it('fails over to the highest-ranked healthy candidate and verifies the switch', async () => {
    const switchGateway = vi.fn(async () => ({ healthy: true, reason: 'post-switch probe passed' }));
    const failover = new MultiGatewayFailover({ switchGateway });

    const result = await failover.failover({
      currentGatewayId: 'gw-a',
      gateways: [gateway('gw-a'), gateway('gw-b'), gateway('gw-c')],
      health: {
        'gw-a': health('gw-a', 0, 1000, 'unreachable'),
        'gw-b': health('gw-b', 96, 50),
        'gw-c': health('gw-c', 88, 80),
      },
      now: new Date('2026-08-28T11:00:30.000Z'),
    });

    expect(result.state).toBe('succeeded');
    expect(result.switched).toBe(true);
    expect(result.currentGatewayId).toBe('gw-b');
    expect(result.selected?.gateway.id).toBe('gw-b');
    expect(result.attempts).toEqual([
      expect.objectContaining({ gatewayId: 'gw-b', attempt: 1, switched: true, verified: true }),
    ]);
    expect(switchGateway).toHaveBeenCalledTimes(1);
    expect(switchGateway.mock.calls[0]?.[0].gateway.id).toBe('gw-b');
  });

  it('skips failed candidates, quarantines them, and succeeds on the next verified gateway', async () => {
    const switchGateway = vi.fn()
      .mockResolvedValueOnce({ healthy: false, reason: 'verification timeout' })
      .mockResolvedValueOnce({ healthy: true, reason: 'post-switch probe passed' });
    const failover = new MultiGatewayFailover({ switchGateway }, undefined, { quarantineMs: 60_000, maxFailovers: 3 });

    const result = await failover.failover({
      currentGatewayId: 'gw-a',
      gateways: [gateway('gw-a'), gateway('gw-b'), gateway('gw-c')],
      health: {
        'gw-a': health('gw-a', 0, 1000, 'unreachable'),
        'gw-b': health('gw-b', 96, 50),
        'gw-c': health('gw-c', 90, 60),
      },
      now: new Date('2026-08-28T11:00:30.000Z'),
    });

    expect(result.state).toBe('succeeded');
    expect(result.currentGatewayId).toBe('gw-c');
    expect(result.attempts[0]).toMatchObject({ gatewayId: 'gw-b', verified: false });
    expect(result.attempts[1]).toMatchObject({ gatewayId: 'gw-c', verified: true });
    expect(failover.isQuarantined('gw-b', Date.parse('2026-08-28T11:00:30.000Z'))).toBe(true);
  });

  it('does not fail over while the current gateway remains healthy', async () => {
    const switchGateway = vi.fn(async () => ({ healthy: true }));
    const failover = new MultiGatewayFailover({ switchGateway });

    const result = await failover.failover({
      currentGatewayId: 'gw-a',
      gateways: [gateway('gw-a'), gateway('gw-b')],
      health: {
        'gw-a': health('gw-a', 95, 50),
        'gw-b': health('gw-b', 99, 40),
      },
      now: new Date('2026-08-28T11:00:30.000Z'),
    });

    expect(result.state).toBe('idle');
    expect(result.switched).toBe(false);
    expect(result.currentGatewayId).toBe('gw-a');
    expect(switchGateway).not.toHaveBeenCalled();
  });

  it('exhausts deterministically when every eligible candidate fails', async () => {
    const switchGateway = vi.fn(async () => { throw new Error('switch failed'); });
    const failover = new MultiGatewayFailover({ switchGateway }, undefined, { maxFailovers: 2 });

    const result = await failover.failover({
      currentGatewayId: 'gw-a',
      gateways: [gateway('gw-a'), gateway('gw-b'), gateway('gw-c')],
      health: {
        'gw-a': health('gw-a', 0, 1000, 'unreachable'),
        'gw-b': health('gw-b', 96, 50),
        'gw-c': health('gw-c', 95, 55),
      },
      now: new Date('2026-08-28T11:00:30.000Z'),
    });

    expect(result.state).toBe('exhausted');
    expect(result.switched).toBe(false);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts.map((attempt) => attempt.gatewayId)).toEqual(['gw-b', 'gw-c']);
  });

  it('rejects concurrent operations on the same failover engine', async () => {
    let release!: () => void;
    const switchGateway = vi.fn(() => new Promise<{ healthy: boolean }>((resolve) => {
      release = () => resolve({ healthy: true });
    }));
    const failover = new MultiGatewayFailover({ switchGateway });
    const request = {
      currentGatewayId: 'gw-a',
      gateways: [gateway('gw-a'), gateway('gw-b')],
      health: {
        'gw-a': health('gw-a', 0, 1000, 'unreachable'),
        'gw-b': health('gw-b', 95, 50),
      },
      now: new Date('2026-08-28T11:00:30.000Z'),
    };

    const first = failover.failover(request);
    await expect(failover.failover(request)).rejects.toThrow('Concurrent multi-gateway failover operation rejected');
    release();
    await expect(first).resolves.toMatchObject({ state: 'succeeded', currentGatewayId: 'gw-b' });
  });

  it('does not mutate request evidence and supports clearing quarantine', async () => {
    const input = {
      gateways: [gateway('gw-a'), gateway('gw-b')],
      health: {
        'gw-a': health('gw-a', 0, 1000, 'unreachable'),
        'gw-b': health('gw-b', 95, 50),
      },
      currentGatewayId: 'gw-a',
      now: new Date('2026-08-28T11:00:30.000Z'),
    };
    const before = JSON.stringify(input);
    const failover = new MultiGatewayFailover({ switchGateway: async () => ({ healthy: false }) });

    await failover.failover(input);
    failover.clearQuarantine('gw-b');

    expect(JSON.stringify(input)).toBe(before);
    expect(failover.isQuarantined('gw-b', Date.parse('2026-08-28T11:00:30.000Z'))).toBe(false);
  });
});
