import { describe, expect, it, vi } from 'vitest';
import { InMemoryGatewayFleetManager, type GatewayProvisioningMetadata } from './fleet.js';
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
  const publish = vi.fn();
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

  it('updates provisioning metadata without changing gateway identity', () => {
    const { manager } = createManager();
    const updated = manager.updateProvisioning('gw-1', {
      ...provisioning,
      configurationVersion: '2026.08.28.2',
    });
    expect(updated.gateway.id).toBe('gw-1');
    expect(updated.provisioning.configurationVersion).toBe('2026.08.28.2');
  });

  it('performs explicit idempotent lifecycle operations and rejects retired gateways', () => {
    const { manager } = createManager();
    const activated = manager.setDesiredState('gw-1', 'active', 'activate gateway');
    expect(activated.gateway.lifecycle).toBe('active');
    expect(manager.setDesiredState('gw-1', 'active', 'activate gateway')).toEqual(activated);

    const draining = manager.setDesiredState('gw-1', 'draining', 'maintenance drain');
    expect(draining.gateway.lifecycle).toBe('draining');
    const disabled = manager.setDesiredState('gw-1', 'disabled', 'disable during maintenance');
    expect(disabled.gateway.lifecycle).toBe('disabled');
    manager.setDesiredState('gw-1', 'active', 'return to service');
    manager.setDesiredState('gw-1', 'disabled', 'disable before retirement');
    const { registry } = createManager();
    registry.transition('gw-1', 'active');
    registry.transition('gw-1', 'disabled');
    registry.transition('gw-1', 'retired');
    expect(() => manager.setDesiredState('gw-1', 'active', 'unsafe restore')).toThrow('retired gateways');
  });

  it('enforces capacity bounds for reservation and release', () => {
    const { manager } = createManager();
    manager.setCapacityLimit('gw-1', 100);
    expect(manager.reserveCapacity('gw-1', 40).capacity.reserved).toBe(40);
    expect(manager.reserveCapacity('gw-1', 60).capacity.reserved).toBe(100);
    expect(() => manager.reserveCapacity('gw-1', 1)).toThrow('capacity allocation exceeds limit');
    expect(manager.releaseCapacity('gw-1', 25).capacity.reserved).toBe(75);
    expect(() => manager.releaseCapacity('gw-1', 76)).toThrow('cannot release more reserved capacity');
    expect(() => manager.reserveCapacity('gw-1', 0)).toThrow('positive number');
    expect(() => manager.setCapacityLimit('gw-1', -1)).toThrow('non-negative number');
  });

  it('validates maintenance windows and reports active windows deterministically', () => {
    const { manager } = createManager();
    manager.scheduleMaintenance('gw-1', {
      startsAt: '2026-08-28T13:00:00.000Z',
      endsAt: '2026-08-28T14:00:00.000Z',
      reason: 'planned kernel upgrade',
    });
    expect(manager.isUnderMaintenance('gw-1', new Date('2026-08-28T12:59:59.999Z'))).toBe(false);
    expect(manager.isUnderMaintenance('gw-1', new Date('2026-08-28T13:00:00.000Z'))).toBe(true);
    expect(manager.isUnderMaintenance('gw-1', new Date('2026-08-28T14:00:00.000Z'))).toBe(false);
    expect(() => manager.scheduleMaintenance('gw-1', {
      startsAt: '2026-08-28T14:00:00.000Z',
      endsAt: '2026-08-28T13:00:00.000Z',
      reason: 'invalid',
    })).toThrow('endsAt must be after startsAt');
    expect(manager.clearMaintenance('gw-1').maintenanceWindow).toBeUndefined();
  });

  it('tracks upgrade state with a strict state machine', () => {
    const { manager } = createManager();
    expect(() => manager.markUpgradeStarted('gw-1')).toThrow('must be scheduled');
    expect(manager.scheduleUpgrade('gw-1', '2026.09.01.0').upgrade.status).toBe('scheduled');
    expect(manager.markUpgradeStarted('gw-1').upgrade.status).toBe('in-progress');
    const completed = manager.markUpgradeCompleted('gw-1', 'post-upgrade verification passed');
    expect(completed.upgrade.status).toBe('succeeded');
    expect(completed.upgrade.completedAt).toEqual(expect.any(String));
    expect(() => manager.markUpgradeCompleted('gw-1')).toThrow('must be in progress');
  });

  it('records failed upgrades and rejects invalid scheduling', () => {
    const { manager } = createManager();
    expect(() => manager.scheduleUpgrade('gw-1', '')).toThrow('targetVersion is required');
    manager.scheduleUpgrade('gw-1', '2026.09.02.0');
    manager.markUpgradeStarted('gw-1');
    const failed = manager.markUpgradeFailed('gw-1', 'verification failed');
    expect(failed.upgrade.status).toBe('failed');
    expect(failed.upgrade.reason).toBe('verification failed');
    expect(() => manager.markUpgradeFailed('gw-1', 'again')).toThrow('must be in progress');
  });

  it('publishes operational telemetry without changing state semantics', () => {
    const { manager, publish } = createManager();
    manager.setCapacityLimit('gw-1', 10);
    manager.reserveCapacity('gw-1', 2);
    manager.scheduleMaintenance('gw-1', {
      startsAt: '2026-08-28T13:00:00.000Z',
      endsAt: '2026-08-28T14:00:00.000Z',
      reason: 'upgrade',
    });
    expect(publish).toHaveBeenCalled();
    expect(publish.mock.calls.every((call) => call.length === 1 && call[0].gatewayId === 'gw-1')).toBe(true);
  });
});
