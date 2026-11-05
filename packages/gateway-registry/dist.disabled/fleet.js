const VALID_DESIRED_STATES = ['active', 'draining', 'disabled'];
const clone = (value) => structuredClone(value);
function requireNonEmpty(value, field) {
    if (!value.trim())
        throw new Error(`${field} is required`);
}
function assertTimestamp(value, field) {
    if (!Number.isFinite(Date.parse(value)))
        throw new Error(`${field} must be a valid ISO timestamp`);
}
function assertProvisioning(value) {
    requireNonEmpty(value.requestedBy, 'provisioning requestedBy');
    requireNonEmpty(value.configurationVersion, 'provisioning configurationVersion');
    assertTimestamp(value.requestedAt, 'provisioning requestedAt');
}
function assertCapacity(value) {
    if (!Number.isFinite(value.limit) || value.limit < 0)
        throw new Error('capacity limit must be a finite non-negative number');
    if (!Number.isFinite(value.allocated) || value.allocated < 0)
        throw new Error('capacity allocated must be a finite non-negative number');
    if (!Number.isFinite(value.reserved) || value.reserved < 0)
        throw new Error('capacity reserved must be a finite non-negative number');
    if (value.allocated + value.reserved > value.limit)
        throw new Error('capacity allocation exceeds limit');
    assertTimestamp(value.checkedAt, 'capacity checkedAt');
}
function assertMaintenance(window) {
    requireNonEmpty(window.reason, 'maintenance reason');
    assertTimestamp(window.startsAt, 'maintenance startsAt');
    assertTimestamp(window.endsAt, 'maintenance endsAt');
    if (Date.parse(window.endsAt) <= Date.parse(window.startsAt))
        throw new Error('maintenance endsAt must be after startsAt');
}
function assertUpgrade(value) {
    requireNonEmpty(value.targetVersion, 'upgrade targetVersion');
    assertTimestamp(value.requestedAt, 'upgrade requestedAt');
    if (value.startedAt !== undefined)
        assertTimestamp(value.startedAt, 'upgrade startedAt');
    if (value.completedAt !== undefined)
        assertTimestamp(value.completedAt, 'upgrade completedAt');
    if ((value.status === 'succeeded' || value.status === 'failed') &&
        value.completedAt === undefined) {
        throw new Error('completedAt is required for a terminal upgrade status');
    }
}
function desiredToLifecycle(desiredState) {
    return desiredState;
}
export class InMemoryGatewayFleetManager {
    registry;
    telemetry;
    records = new Map();
    constructor(registry, telemetry) {
        this.registry = registry;
        this.telemetry = telemetry;
    }
    register(gateway, provisioning) {
        assertProvisioning(provisioning);
        if (gateway.lifecycle === 'retired')
            throw new Error('retired gateways cannot be registered for fleet management');
        if (this.records.has(gateway.id))
            throw new Error(`gateway fleet record ${gateway.id} already exists`);
        const registered = this.registry.register(gateway);
        const now = new Date().toISOString();
        const initialDesiredState = registered.lifecycle === 'draining'
            ? 'draining'
            : registered.lifecycle === 'disabled'
                ? 'disabled'
                : 'active';
        const record = {
            gateway: registered,
            desiredState: initialDesiredState,
            provisioning: clone(provisioning),
            capacity: { limit: 0, allocated: 0, reserved: 0, checkedAt: now },
            upgrade: {
                targetVersion: provisioning.configurationVersion,
                status: 'none',
                requestedAt: now,
            },
            updatedAt: now,
        };
        this.records.set(gateway.id, record);
        return clone(record);
    }
    get(gatewayId) {
        const record = this.records.get(gatewayId);
        return record === undefined ? undefined : clone(record);
    }
    list() {
        return [...this.records.values()]
            .sort((a, b) => a.gateway.id.localeCompare(b.gateway.id))
            .map(clone);
    }
    updateProvisioning(gatewayId, provisioning) {
        assertProvisioning(provisioning);
        const record = this.requireRecord(gatewayId);
        const updated = this.replace(record, { provisioning: clone(provisioning) });
        return this.commit(updated, 'gateway.fleet.provisioning.updated', 'Gateway provisioning metadata updated.');
    }
    updateGateway(gatewayId, patch) {
        const record = this.requireRecord(gatewayId);
        const gateway = this.registry.update(gatewayId, patch);
        const updated = this.replace(record, { gateway });
        return this.commit(updated, 'gateway.fleet.provisioning.updated', 'Gateway metadata updated.');
    }
    setDesiredState(gatewayId, desiredState, reason) {
        requireNonEmpty(reason, 'reason');
        if (!VALID_DESIRED_STATES.includes(desiredState))
            throw new Error(`unsupported gateway desired state: ${desiredState}`);
        const record = this.requireRecord(gatewayId);
        const canonicalGateway = this.registry.get(gatewayId);
        if (canonicalGateway?.lifecycle === 'retired' || record.gateway.lifecycle === 'retired') {
            throw new Error('retired gateways cannot be managed by fleet operations');
        }
        if (record.desiredState === desiredState &&
            record.gateway.lifecycle === desiredToLifecycle(desiredState))
            return clone(record);
        if (desiredState === 'disabled' && record.capacity.allocated + record.capacity.reserved > 0) {
            throw new Error('gateway cannot be disabled while capacity is allocated or reserved');
        }
        const gateway = this.registry.transition(gatewayId, desiredToLifecycle(desiredState));
        const updated = this.replace(record, { gateway, desiredState });
        return this.commit(updated, 'gateway.fleet.state.changed', reason);
    }
    setCapacityLimit(gatewayId, limit) {
        if (!Number.isFinite(limit) || limit < 0)
            throw new Error('capacity limit must be a finite non-negative number');
        const record = this.requireRecord(gatewayId);
        const capacity = { ...record.capacity, limit, checkedAt: new Date().toISOString() };
        assertCapacity(capacity);
        return this.commit(this.replace(record, { capacity }), 'gateway.fleet.capacity.updated', 'Gateway capacity limit updated.');
    }
    setAllocatedCapacity(gatewayId, amount) {
        if (!Number.isFinite(amount) || amount < 0)
            throw new Error('allocated capacity must be a finite non-negative number');
        const record = this.requireRecord(gatewayId);
        const capacity = { ...record.capacity, allocated: amount, checkedAt: new Date().toISOString() };
        assertCapacity(capacity);
        return this.commit(this.replace(record, { capacity }), 'gateway.fleet.capacity.updated', 'Gateway allocated capacity updated.');
    }
    reserveCapacity(gatewayId, amount) {
        this.assertAmount(amount);
        const record = this.requireRecord(gatewayId);
        const capacity = {
            ...record.capacity,
            reserved: record.capacity.reserved + amount,
            checkedAt: new Date().toISOString(),
        };
        assertCapacity(capacity);
        return this.commit(this.replace(record, { capacity }), 'gateway.fleet.capacity.reserved', `Reserved ${amount} capacity unit(s).`);
    }
    releaseCapacity(gatewayId, amount) {
        this.assertAmount(amount);
        const record = this.requireRecord(gatewayId);
        if (amount > record.capacity.reserved)
            throw new Error('cannot release more reserved capacity than available');
        const capacity = {
            ...record.capacity,
            reserved: record.capacity.reserved - amount,
            checkedAt: new Date().toISOString(),
        };
        assertCapacity(capacity);
        return this.commit(this.replace(record, { capacity }), 'gateway.fleet.capacity.released', `Released ${amount} capacity unit(s).`);
    }
    scheduleMaintenance(gatewayId, window) {
        assertMaintenance(window);
        const record = this.requireRecord(gatewayId);
        const canonicalGateway = this.registry.get(gatewayId);
        if (canonicalGateway?.lifecycle === 'retired' || record.gateway.lifecycle === 'retired') {
            throw new Error('retired gateways cannot have maintenance scheduled');
        }
        return this.commit(this.replace(record, { maintenanceWindow: clone(window) }), 'gateway.fleet.maintenance.scheduled', window.reason);
    }
    clearMaintenance(gatewayId) {
        const record = this.requireRecord(gatewayId);
        const { maintenanceWindow: _maintenanceWindow, gateway, desiredState, provisioning, capacity, upgrade, } = record;
        const updated = {
            gateway,
            desiredState,
            provisioning,
            capacity,
            upgrade,
            updatedAt: new Date().toISOString(),
        };
        return this.commit(updated, 'gateway.fleet.maintenance.cleared', 'Gateway maintenance window cleared.');
    }
    isUnderMaintenance(gatewayId, at = new Date()) {
        const record = this.requireRecord(gatewayId);
        if (record.maintenanceWindow === undefined)
            return false;
        const timestamp = at.getTime();
        if (!Number.isFinite(timestamp))
            throw new Error('at must be a valid date');
        return (timestamp >= Date.parse(record.maintenanceWindow.startsAt) &&
            timestamp < Date.parse(record.maintenanceWindow.endsAt));
    }
    scheduleUpgrade(gatewayId, targetVersion, reason = 'Gateway upgrade scheduled.') {
        requireNonEmpty(targetVersion, 'upgrade targetVersion');
        requireNonEmpty(reason, 'reason');
        const record = this.requireRecord(gatewayId);
        const canonicalGateway = this.registry.get(gatewayId);
        if (canonicalGateway?.lifecycle === 'retired' || record.gateway.lifecycle === 'retired') {
            throw new Error('retired gateways cannot be upgraded');
        }
        if (record.upgrade.status === 'in-progress')
            throw new Error('gateway upgrade is already in progress');
        const now = new Date().toISOString();
        const upgrade = {
            targetVersion,
            status: 'scheduled',
            requestedAt: now,
            reason,
        };
        assertUpgrade(upgrade);
        return this.commit(this.replace(record, { upgrade }), 'gateway.fleet.upgrade.scheduled', reason);
    }
    markUpgradeStarted(gatewayId) {
        const record = this.requireRecord(gatewayId);
        if (record.upgrade.status !== 'scheduled')
            throw new Error('gateway upgrade must be scheduled before starting');
        const upgrade = {
            ...record.upgrade,
            status: 'in-progress',
            startedAt: new Date().toISOString(),
        };
        assertUpgrade(upgrade);
        return this.commit(this.replace(record, { upgrade }), 'gateway.fleet.upgrade.started', 'Gateway upgrade started.');
    }
    markUpgradeCompleted(gatewayId, reason = 'Gateway upgrade completed.') {
        requireNonEmpty(reason, 'reason');
        const record = this.requireRecord(gatewayId);
        if (record.upgrade.status !== 'in-progress')
            throw new Error('gateway upgrade must be in progress before completion');
        const completedAt = new Date().toISOString();
        const upgrade = {
            ...record.upgrade,
            status: 'succeeded',
            completedAt,
            reason,
        };
        assertUpgrade(upgrade);
        return this.commit(this.replace(record, { upgrade }), 'gateway.fleet.upgrade.completed', reason);
    }
    markUpgradeFailed(gatewayId, reason) {
        requireNonEmpty(reason, 'reason');
        const record = this.requireRecord(gatewayId);
        if (record.upgrade.status !== 'in-progress')
            throw new Error('gateway upgrade must be in progress before failure can be recorded');
        const completedAt = new Date().toISOString();
        const upgrade = {
            ...record.upgrade,
            status: 'failed',
            completedAt,
            reason,
        };
        assertUpgrade(upgrade);
        return this.commit(this.replace(record, { upgrade }), 'gateway.fleet.upgrade.failed', reason);
    }
    requireRecord(gatewayId) {
        const record = this.records.get(gatewayId);
        if (record === undefined)
            throw new Error(`gateway fleet record ${gatewayId} not found`);
        return record;
    }
    replace(record, patch) {
        return { ...record, ...patch, updatedAt: new Date().toISOString() };
    }
    commit(record, eventType, reason) {
        assertCapacity(record.capacity);
        assertUpgrade(record.upgrade);
        this.records.set(record.gateway.id, record);
        void this.telemetry?.publish({
            type: eventType,
            gatewayId: record.gateway.id,
            occurredAt: record.updatedAt,
            reason,
        });
        return clone(record);
    }
    assertAmount(amount) {
        if (!Number.isFinite(amount) || amount <= 0)
            throw new Error('capacity amount must be a finite positive number');
    }
}
//# sourceMappingURL=fleet.js.map