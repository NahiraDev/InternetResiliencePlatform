/**
 * Phase 115 — Device Enrollment & Lifecycle.
 *
 * Operational lifecycle for managed devices layered on top of the identity
 * ledger: provisioning → active ⇄ maintenance → decommissioning → decommissioned,
 * plus derived presence (online / stale / lost) from heartbeats. Decommissioning
 * requires the device identity to have been revoked first, so a retired device
 * can never keep control-plane trust.
 */
export type LifecycleState = 'provisioning' | 'active' | 'maintenance' | 'decommissioning' | 'decommissioned';
export type Presence = 'online' | 'stale' | 'lost' | 'never-seen';
export interface DeviceLifecycleRecord {
    readonly deviceId: string;
    readonly state: LifecycleState;
    readonly changedAtMs: number;
    readonly history: readonly {
        readonly from: LifecycleState | 'none';
        readonly to: LifecycleState;
        readonly atMs: number;
        readonly reason: string;
    }[];
}
export interface PresencePolicy {
    readonly staleAfterMs: number;
    readonly lostAfterMs: number;
}
export declare const DEFAULT_PRESENCE_POLICY: PresencePolicy;
export declare class LifecycleError extends Error {
    readonly code: string;
    constructor(code: string, detail?: string);
}
export declare const derivePresence: (lastSeenAtMs: number | undefined, nowMs: number, policy?: PresencePolicy) => Presence;
export interface LifecycleDependencies {
    /** Returns true while the device's identity is still trusted (enrolled). */
    readonly isIdentityTrusted: (deviceId: string) => boolean;
}
export declare class DeviceLifecycleManager {
    private readonly deps;
    private readonly records;
    constructor(deps: LifecycleDependencies);
    begin(deviceId: string, nowMs: number): DeviceLifecycleRecord;
    transition(deviceId: string, to: LifecycleState, reason: string, nowMs: number): DeviceLifecycleRecord;
    get(deviceId: string): DeviceLifecycleRecord | undefined;
    inState(state: LifecycleState): readonly string[];
    /** Only active, trusted devices may receive orchestrated work. */
    isOperational(deviceId: string): boolean;
}
//# sourceMappingURL=device-lifecycle.d.ts.map