import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryGatewayFleetManager,
  type GatewayFleetTelemetry,
  type GatewayProvisioningMetadata,
} from './fleet.js';
import { InMemoryGatewayRegistry, type GatewayMetadata } from './index.js';

const provisioning: GatewayProvisioningMetadata = {
  requestedBy: 'test-operator',
  source: 'control-plane',
  requestedAt: '2026-08-28T12:00:00.000Z',
  configurationVersion: '2026.08.28.1',
};

const gateway = (overrides: Partial<GatewayMetadata> = {}): GatewayMetadata => ({
  id: 'gw-1',
  name: 'Gateway 1',
  endpoint: { host: 'gw-1.example.test', port: 51820, family: 'dual' },
  ownership: { ownerId: 'owner-1', managedBy: 'control-plane' },
  capabilities: {
    tunnelProtocols: ['wireguard'],
    addressFamilies: ['dual'],
    transports: ['udp'],
    features: ['health-check'],
  },
  lifecycle: 'registered',
  trust: 'trusted',
  tags: ['prod'],
  createdAt: '2026-08-28T12:00:00.000Z',
  updatedAt: '2026-08-28T12:00:00.000Z',
  ...overrides,
});

const createManager = () => {
  const registry = new InMemoryGatewayRegistry();
  const publish = vi.fn<GatewayFleetTelemetry['publish']>();
  const manager = new InMemoryGatewayFleetManager(registry, { publish });
  manager.register(gateway(), provisioning);
  return { manager, registry, publish };
};

describe('InMemoryGatewayFleetManager', () => {
  it('registers fleet metadata and returns defensive copies', () => {
    const { manager } = createManager();
    const record = manager.get('gw-1');
    expect(record?.desiredState).toBe('active');
    expect(record?.capacity).toEqual({ limit: 0, allocated: 0, reserved: 0, checkedAt: expect.any(String) });
    expect(record?.upgrade.targetVersion).toBe('2026.08.28.1');

    record!.gateway.tags.push('mutated');
    record!.provisioning.configurationVersion = 'tampered';
    expect(manager.get('gw-1')?.gateway.tags).toEqual(['prod']);
    expect(manager.get('gw-1')?.provisioning.configurationVersion).toBe('2026.08.28.1');
  });

  it('rejects retired gateways during fleet registration', () => {
    const registry = new InMemoryGatewayRegistry();
    const manager = new InMemoryGatewayFleetManager(registry);
    expect(() => manager.register(gateway({ lifecycle: 'retired' }), provisioning)).toThrow('retired gateways');
  });

  it('updates provisioning metadata without changing gateway identity', () => {
    const { manager } = createManager();
    const updated = manager.updateProvisioning('gw-1', {
      ...provisioning,
      configurationVersion: '2026.08.28.2',
    });
    expect(updated.gateway.id).toBe('gw-1');
    expect(updated.provisioning.configurationVersion).toBe('2026.08.28.2');
  });

  it('performs explicit idempotent lifecycle operations and respects canonical retirement', () => {
    const { manager, registry } = createManager();
    const activated = manager.setDesiredState('gw-1', 'active', 'activate gateway');
    expect(activated.gateway.lifecycle).toBe('active');
    expect(manager.setDesiredState('gw-1', 'active', 'activate gateway')).toEqual(activated);

    expect(manager.setDesiredState('gw-1', 'draining', 'maintenance drain').gateway.lifecycle).toBe('draining');
    manager.setCapacityLimit('gw-1', 10);
    manager.setAllocatedCapacity('gw-1', 10);
    expect(() => manager.setDesiredState('gw-1', 'disabled', 'disable during maintenance')).toThrow(
      'gateway cannot be disabled while capacity is allocated or reserved',
    );
    manager.setAllocatedCapacity('gw-1', 0);
    expect(manager.setDesiredState('gw-1', 'disabled', 'disable during maintenance').gateway.lifecycle).toBe('disabled');
    registry.transition('gw-1', 'retired');
    expect(() => manager.setDesiredState('gw-1', 'active', 'unsafe restore')).toThrow('retired gateways');
  });

  it('enforces capacity bounds for reservation, allocation and release', () => {
    const { manager } = createManager();
    manager.setCapacityLimit('gw-1', 100);
    expect(manager.setAllocatedCapacity('gw-1', 50).capacity.allocated).toBe(50);
    expect(manager.reserveCapacity('gw-1', 40).capacity.reserved).toBe(40);
    expect(() => manager.reserveCapacity('gw-1', 11)).toThrow('capacity allocation exceeds limit');
    expect(() => manager.setAllocatedCapacity('gw-1', 61)).toThrow('capacity allocation exceeds limit');
    expect(manager.releaseCapacity('gw-1', { allocated: 50, reserved: 40 }).capacity).toEqual({
      limit: 100,
      allocated: 0,
      reserved: 0,
      checkedAt: expect.any(String),
    });
  });

  it('validates maintenance windows and reports active windows deterministically', () => {
    const { manager } = createManager();
    manager.scheduleMaintenance('gw-1', {
      id: 'mw-1',
      startsAt: '2026-08-28T13:00:00.000Z',
      endsAt: '2026-08-28T14:00:00.000Z',
      reason: 'upgrade',
    });
    expect(manager.isInMaintenance('gw-1', new Date('2026-08-28T13:30:00.000Z'))).toBe(true);
    expect(manager.isInMaintenance('gw-1', new Date('2026-08-28T14:00:00.000Z'))).toBe(false);
    expect(() => manager.scheduleMaintenance('gw-1', {
      id: 'mw-invalid',
      startsAt: '2026-08-28T14:00:00.000Z',
      endsAt: '2026-08-28T14:00:00.000Z',
      reason: 'invalid',
    })).toThrow('maintenance window must end after it starts');
  });

  it('tracks upgrade state with a strict state machine', () => {
    const { manager } = createManager();
    expect(manager.scheduleUpgrade('gw-1', '2026.08.28.2', 'planned upgrade').upgrade.state).toBe('scheduled');
    expect(manager.startUpgrade('gw-1').upgrade.state).toBe('in-progress');
    expect(manager.completeUpgrade('gw-1', '2026.08.28.2').upgrade.state).toBe('succeeded');
    expect(() => manager.startUpgrade('gw-1')).toThrow('upgrade must be scheduled');
  });

  it('records failed upgrades and rejects invalid scheduling', () => {
    const { manager } = createManager();
    expect(() => manager.scheduleUpgrade('gw-1', '', 'invalid')).toThrow('target version is required');
    manager.scheduleUpgrade('gw-1', '2026.08.28.2', 'planned upgrade');
    manager.startUpgrade('gw-1');
    expect(manager.failUpgrade('gw-1', 'verification failed').upgrade.state).toBe('failed');
    expect(manager.get('gw-1')?.upgrade.reason).toBe('verification failed');
  });

  it('publishes operational telemetry without changing state semantics', () => {
    const { manager, publish } = createManager();
    manager.setDesiredState('gw-1', 'draining', 'operator requested drain');
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'gateway.fleet.lifecycle_changed',
      gatewayId: 'gw-1',
      desiredState: 'draining',
    }));
  });
});
