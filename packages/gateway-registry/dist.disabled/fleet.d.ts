import type { GatewayMetadata, GatewayPatch, GatewayRegistry } from './index.js';
export type GatewayFleetDesiredState = 'active' | 'draining' | 'disabled';
export type GatewayUpgradeStatus = 'none' | 'scheduled' | 'in-progress' | 'succeeded' | 'failed';
export interface GatewayProvisioningMetadata {
    requestedBy: string;
    source: 'manual' | 'control-plane' | 'provider';
    requestedAt: string;
    configurationVersion: string;
}
export interface GatewayCapacityState {
    limit: number;
    allocated: number;
    reserved: number;
    checkedAt: string;
}
export interface GatewayMaintenanceWindow {
    startsAt: string;
    endsAt: string;
    reason: string;
}
export interface GatewayUpgradeState {
    targetVersion: string;
    status: GatewayUpgradeStatus;
    requestedAt: string;
    startedAt?: string;
    completedAt?: string;
    reason?: string;
}
export interface GatewayFleetRecord {
    gateway: GatewayMetadata;
    desiredState: GatewayFleetDesiredState;
    provisioning: GatewayProvisioningMetadata;
    capacity: GatewayCapacityState;
    maintenanceWindow?: GatewayMaintenanceWindow;
    upgrade: GatewayUpgradeState;
    updatedAt: string;
}
export type GatewayFleetEventType = 'gateway.fleet.provisioning.updated' | 'gateway.fleet.state.changed' | 'gateway.fleet.capacity.updated' | 'gateway.fleet.capacity.reserved' | 'gateway.fleet.capacity.released' | 'gateway.fleet.maintenance.scheduled' | 'gateway.fleet.maintenance.cleared' | 'gateway.fleet.upgrade.scheduled' | 'gateway.fleet.upgrade.started' | 'gateway.fleet.upgrade.completed' | 'gateway.fleet.upgrade.failed';
export interface GatewayFleetEvent {
    type: GatewayFleetEventType;
    gatewayId: string;
    occurredAt: string;
    reason: string;
}
export interface GatewayFleetTelemetry {
    publish(event: GatewayFleetEvent): Promise<void> | void;
}
export interface GatewayFleetManager {
    register(gateway: GatewayMetadata, provisioning: GatewayProvisioningMetadata): GatewayFleetRecord;
    get(gatewayId: string): GatewayFleetRecord | undefined;
    list(): GatewayFleetRecord[];
    updateProvisioning(gatewayId: string, provisioning: GatewayProvisioningMetadata): GatewayFleetRecord;
    updateGateway(gatewayId: string, patch: GatewayPatch): GatewayFleetRecord;
    setDesiredState(gatewayId: string, desiredState: GatewayFleetDesiredState, reason: string): GatewayFleetRecord;
    setCapacityLimit(gatewayId: string, limit: number): GatewayFleetRecord;
    setAllocatedCapacity(gatewayId: string, amount: number): GatewayFleetRecord;
    reserveCapacity(gatewayId: string, amount: number): GatewayFleetRecord;
    releaseCapacity(gatewayId: string, amount: number): GatewayFleetRecord;
    scheduleMaintenance(gatewayId: string, window: GatewayMaintenanceWindow): GatewayFleetRecord;
    clearMaintenance(gatewayId: string): GatewayFleetRecord;
    isUnderMaintenance(gatewayId: string, at?: Date): boolean;
    scheduleUpgrade(gatewayId: string, targetVersion: string, reason?: string): GatewayFleetRecord;
    markUpgradeStarted(gatewayId: string): GatewayFleetRecord;
    markUpgradeCompleted(gatewayId: string, reason?: string): GatewayFleetRecord;
    markUpgradeFailed(gatewayId: string, reason: string): GatewayFleetRecord;
}
export declare class InMemoryGatewayFleetManager implements GatewayFleetManager {
    private readonly registry;
    private readonly telemetry?;
    private readonly records;
    constructor(registry: GatewayRegistry, telemetry?: GatewayFleetTelemetry | undefined);
    register(gateway: GatewayMetadata, provisioning: GatewayProvisioningMetadata): GatewayFleetRecord;
    get(gatewayId: string): GatewayFleetRecord | undefined;
    list(): GatewayFleetRecord[];
    updateProvisioning(gatewayId: string, provisioning: GatewayProvisioningMetadata): GatewayFleetRecord;
    updateGateway(gatewayId: string, patch: GatewayPatch): GatewayFleetRecord;
    setDesiredState(gatewayId: string, desiredState: GatewayFleetDesiredState, reason: string): GatewayFleetRecord;
    setCapacityLimit(gatewayId: string, limit: number): GatewayFleetRecord;
    setAllocatedCapacity(gatewayId: string, amount: number): GatewayFleetRecord;
    reserveCapacity(gatewayId: string, amount: number): GatewayFleetRecord;
    releaseCapacity(gatewayId: string, amount: number): GatewayFleetRecord;
    scheduleMaintenance(gatewayId: string, window: GatewayMaintenanceWindow): GatewayFleetRecord;
    clearMaintenance(gatewayId: string): GatewayFleetRecord;
    isUnderMaintenance(gatewayId: string, at?: Date): boolean;
    scheduleUpgrade(gatewayId: string, targetVersion: string, reason?: string): GatewayFleetRecord;
    markUpgradeStarted(gatewayId: string): GatewayFleetRecord;
    markUpgradeCompleted(gatewayId: string, reason?: string): GatewayFleetRecord;
    markUpgradeFailed(gatewayId: string, reason: string): GatewayFleetRecord;
    private requireRecord;
    private replace;
    private commit;
    private assertAmount;
}
//# sourceMappingURL=fleet.d.ts.map