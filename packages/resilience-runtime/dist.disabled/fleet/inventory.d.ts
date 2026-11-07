/**
 * Phase 114 — Fleet Management Foundation.
 *
 * Tenant-scoped inventory of managed devices with labels, platform and agent
 * version attributes, heartbeat tracking and selector queries. The inventory
 * records what is known; it confers no authority. Trust comes from the device
 * identity ledger and authorization from capability grants.
 */
export type DevicePlatform = 'linux' | 'macos' | 'windows' | 'ios' | 'android' | 'router' | 'other';
export interface ManagedDevice {
    readonly deviceId: string;
    readonly tenantId: string;
    readonly platform: DevicePlatform;
    readonly agentVersion: string;
    readonly labels: Readonly<Record<string, string>>;
    readonly registeredAtMs: number;
    readonly lastSeenAtMs?: number;
    readonly region?: string;
}
export interface DeviceSelector {
    readonly tenantId?: string;
    readonly platforms?: readonly DevicePlatform[];
    readonly labels?: Readonly<Record<string, string>>;
    readonly regions?: readonly string[];
    readonly minAgentVersion?: string;
    readonly maxAgentVersion?: string;
    readonly deviceIds?: readonly string[];
}
export declare class FleetInventoryError extends Error {
    readonly code: string;
    constructor(code: string);
}
/** Compares dotted numeric versions; non-numeric segments compare as 0. Returns -1, 0 or 1. */
export declare const compareVersions: (a: string, b: string) => number;
export declare const deviceMatches: (d: ManagedDevice, s: DeviceSelector) => boolean;
export declare class FleetInventory {
    private readonly devices;
    register(device: ManagedDevice): ManagedDevice;
    heartbeat(deviceId: string, atMs: number, agentVersion?: string): ManagedDevice;
    setLabels(deviceId: string, labels: Readonly<Record<string, string>>): ManagedDevice;
    remove(deviceId: string): boolean;
    get(deviceId: string): ManagedDevice | undefined;
    get size(): number;
    select(selector?: DeviceSelector): readonly ManagedDevice[];
    groupBy(key: 'platform' | 'agentVersion' | 'region' | `label:${string}`, selector?: DeviceSelector): Readonly<Record<string, number>>;
    stale(nowMs: number, olderThanMs: number): readonly ManagedDevice[];
}
//# sourceMappingURL=inventory.d.ts.map