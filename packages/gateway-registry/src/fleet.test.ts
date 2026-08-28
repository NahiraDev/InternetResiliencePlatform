import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryGatewayFleetManager,
  type GatewayFleetEvent,
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
    expect(record?.capacity).toEqual({
      limit: 0,
      allocated: 0,
      reserved: 0,
      checkedAt: expect.any(String),
    });
    expect(record?.upgrade).toEqual({
      targetVersion: '2026.08.28.1',
      status: 'none',
      requestedAt: expect.any(String),
    });

    record!.gateway.tags.push('mutated');
    record!.provisioning.configurationVersion = 'tampered';
    expect(manager.get('gw-1')?.gateway.tags).toEqual(['prod']);
    expect(manager.get('gw-1')?.provisioning.configurationVersion).toBe('2026.08.28.1');
  });

  it('rejects retired gateways during fleet registration', () => {
    const registry = new InMemoryGatewayRegistry();
    const manager = new InMemoryGatewayFleetManager(registry);

    expect(() => manager.register(gateway({ lifecycle: 'retired' }), provisioning)).toThrow(
      'retired gateways cannot be registered for fleet management',
    );
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

  it('updates gateway metadata through the canonical registry', () => {
    const { manager, registry } = createManager();
    const updated = manager.updateGateway('gw-1', { name: 'Gateway One', tags: ['prod', 'edge'] });

    expect(updated.gateway.name).toBe('Gateway One');
    expect(updated.gateway.tags).toEqual(['prod', 'edge']);
    expect(registry.get('gw-1')?.name).toBe('Gateway One');
    expect(registry.get('gw-1')?.id).toBe('gw-1');
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
    expect(() => manager.setDesiredState('gw-1', 'active', 'unsafe restore')).toThrow(
      'retired gateways cannot be managed by fleet operations',
    );
  });

  it('enforces capacity bounds for allocation, reservation and release', () => {
    const { manager } = createManager();

    manager.setCapacityLimit('gw-1', 100);
    expect(manager.setAllocatedCapacity('gw-1', 50).capacity.allocated).toBe(50);
    expect(manager.reserveCapacity('gw-1', 40).capacity.reserved).toBe(40);
    expect(() => manager.reserveCapacity('gw-1', 11)).toThrow('capacity allocation exceeds limit');
    expect(() => manager.setAllocatedCapacity('gw-1', 61)).toThrow('capacity allocation exceeds limit');
    expect(() => manager.setAllocatedCapacity('gw-1', -1)).toThrow('allocated capacity must be a finite non-negative number');
    expect(() => manager.reserveCapacity('gw-1', 0)).toThrow('capacity amount must be a finite positive number');
    expect(() => manager.releaseCapacity('gw-1', 41)).toThrow('cannot release more reserved capacity than available');

    manager.setAllocatedCapacity('gw-1', 0);
    expect(manager.releaseCapacity('gw-1', 40).capacity).toEqual({
      limit: 100,
      allocated: 0,
      reserved: 0,
      checkedAt: expect.any(String),
    });
  });

  it('rejects capacity-limit reductions that would invalidate existing allocations', () => {
    const { manager } = createManager();

    manager.setCapacityLimit('gw-1', 100);
    manager.setAllocatedCapacity('gw-1', 60);
    manager.reserveCapacity('gw-1', 20);
    expect(() => manager.setCapacityLimit('gw-1', 79)).toThrow('capacity allocation exceeds limit');
    expect(manager.get('gw-1')?.capacity).toMatchObject({ limit: 100, allocated: 60, reserved: 20 });
  });

  it('validates maintenance windows and reports active windows deterministically', () => {
    const { manager } = createManager();
    const window = {
      startsAt: '2026-08-28T13:00:00.000Z',
      endsAt: '2026-08-28T14:00:00.000Z',
      reason: 'upgrade',
    };

    manager.scheduleMaintenance('gw-1', window);
    expect(manager.get('gw-1')?.maintenanceWindow).toEqual(window);
    expect(manager.isUnderMaintenance('gw-1', new Date('2026-08-28T13:00:00.000Z'))).toBe(true);
    expect(manager.isUnderMaintenance('gw-1', new Date('2026-08-28T13:30:00.000Z'))).toBe(true);
    expect(manager.isUnderMaintenance('gw-1', new Date('2026-08-28T14:00:00.000Z'))).toBe(false);

    manager.clearMaintenance('gw-1');
    expect(manager.get('gw-1')?.maintenanceWindow).toBeUndefined();
    expect(manager.isUnderMaintenance('gw-1', new Date('2026-08-28T13:30:00.000Z'))).toBe(false);

    expect(() => manager.scheduleMaintenance('gw-1', {
      startsAt: '2026-08-28T14:00:00.000Z',
      endsAt: '2026-08-28T14:00:00.000Z',
      reason: 'invalid',
    })).toThrow('maintenance endsAt must be after startsAt');
  });

  it('tracks upgrades with a strict state machine', () => {
    const { manager } = createManager();

    expect(manager.scheduleUpgrade('gw-1', '2026.08.28.2', 'planned upgrade').upgrade.status).toBe('scheduled');
    expect(manager.markUpgradeStarted('gw-1').upgrade.status).toBe('in-progress');
    expect(manager.markUpgradeCompleted('gw-1', 'verification passed').upgrade.status).toBe('succeeded');
    expect(manager.get('gw-1')?.upgrade.completedAt).toEqual(expect.any(String));
    expect(() => manager.markUpgradeStarted('gw-1')).toThrow('gateway upgrade must be scheduled before starting');
  });

  it('records failed upgrades and rejects invalid scheduling', () => {
    const { manager } = createManager();

    expect(() => manager.scheduleUpgrade('gw-1', '', 'invalid')).toThrow('upgrade targetVersion is required');
    manager.scheduleUpgrade('gw-1', '2026.08.28.2', 'planned upgrade');
    manager.markUpgradeStarted('gw-1');
    expect(manager.markUpgradeFailed('gw-1', 'verification failed').upgrade.status).toBe('failed');
    expect(manager.get('gw-1')?.upgrade.reason).toBe('verification failed');
    expect(manager.get('gw-1')?.upgrade.completedAt).toEqual(expect.any(String));
  });

  it('prevents concurrent upgrade scheduling and preserves terminal metadata', () => {
    const { manager } = createManager();

    manager.scheduleUpgrade('gw-1', '2026.08.28.2');
    manager.markUpgradeStarted('gw-1');
    expect(() => manager.scheduleUpgrade('gw-1', '2026.08.28.3')).toThrow('gateway upgrade is already in progress');
    const failed = manager.markUpgradeFailed('gw-1', 'executor rejected upgrade');
    expect(failed.upgrade.targetVersion).toBe('2026.08.28.2');
    expect(failed.upgrade.status).toBe('failed');
    expect(failed.upgrade.startedAt).toEqual(expect.any(String));
    expect(failed.upgrade.completedAt).toEqual(expect.any(String));
  });

  it('rejects fleet mutations against a retired canonical gateway', () => {
    const { manager, registry } = createManager();
    registry.transition('gw-1', 'active');
    registry.transition('gw-1', 'retired');

    expect(() => manager.updateProvisioning('gw-1', provisioning)).not.toThrow();
    expect(() => manager.setDesiredState('gw-1', 'active', 'restore')).toThrow('retired gateways cannot be managed by fleet operations');
    expect(() => manager.scheduleMaintenance('gw-1', {
      startsAt: '2026-08-28T13:00:00.000Z',
      endsAt: '2026-08-28T14:00:00.000Z',
      reason: 'retired gateway',
    })).toThrow('retired gateways cannot have maintenance scheduled');
    expect(() => manager.scheduleUpgrade('gw-1', '2026.08.28.2')).toThrow('retired gateways cannot be upgraded');
  });

  it('publishes operational telemetry without changing state semantics', () => {
    const { manager, publish } = createManager();

    manager.setDesiredState('gw-1', 'active', 'operator requested activation');
    manager.setCapacityLimit('gw-1', 10);
    manager.scheduleMaintenance('gw-1', {
      startsAt: '2026-08-28T13:00:00.000Z',
      endsAt: '2026-08-28T14:00:00.000Z',
      reason: 'maintenance',
    });

    expect(publish).toHaveBeenCalledTimes(3);
    expect(publish).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: 'gateway.fleet.state.changed',
      gatewayId: 'gw-1',
      reason: 'operator requested activation',
      occurredAt: expect.any(String),
    } satisfies Partial<GatewayFleetEvent>));
    expect(publish).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'gateway.fleet.capacity.updated',
      gatewayId: 'gw-1',
    } satisfies Partial<GatewayFleetEvent>));
    expect(publish).toHaveBeenNthCalledWith(3, expect.objectContaining({
      type: 'gateway.fleet.maintenance.scheduled',
      gatewayId: 'gw-1',
      reason: 'maintenance',
    } satisfies Partial<GatewayFleetEvent>));
  });

  it('lists records deterministically and returns defensive copies', () => {
    const registry = new InMemoryGatewayRegistry();
    const manager = new InMemoryGatewayFleetManager(registry);
    manager.register(gateway({ id: 'gw-b', name: 'Gateway B' }), provisioning);
    manager.register(gateway({ id: 'gw-a', name: 'Gateway A' }), provisioning);

    const records = manager.list();
    expect(records.map((record) => record.gateway.id)).toEqual(['gw-a', 'gw-b']);

    records[0]!.gateway.tags.push('mutated');
    expect(manager.get('gw-a')?.gateway.tags).toEqual(['prod']);
  });
});
