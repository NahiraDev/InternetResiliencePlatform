/**
 * Phase 120 — Fleet Health & Observability.
 *
 * Aggregates per-device health reports and presence into tenant-scoped fleet
 * rollups: availability, degraded and offline ratios, version skew and SLO
 * status, with ranked offenders. Rollups never mix tenants; callers must pass a
 * single-tenant device set.
 */
import { type Presence, type PresencePolicy } from './device-lifecycle.js';
import { type ManagedDevice } from './inventory.js';
export interface DeviceHealthReport {
    readonly deviceId: string;
    readonly status: 'healthy' | 'degraded' | 'failed' | 'unknown';
    readonly score: number;
    readonly reportedAtMs: number;
}
export interface FleetSlo {
    readonly minAvailability: number;
    readonly maxDegradedRatio: number;
    readonly maxVersionSkew: number;
}
export declare const DEFAULT_FLEET_SLO: FleetSlo;
export interface FleetHealthSummary {
    readonly tenantId: string;
    readonly total: number;
    readonly online: number;
    readonly offline: number;
    readonly healthy: number;
    readonly degraded: number;
    readonly failed: number;
    readonly unknown: number;
    readonly availability: number;
    readonly degradedRatio: number;
    readonly versionDistribution: Readonly<Record<string, number>>;
    readonly versionSkew: number;
    readonly worst: readonly {
        readonly deviceId: string;
        readonly score: number;
        readonly presence: Presence;
    }[];
    readonly slo: {
        readonly met: boolean;
        readonly violations: readonly string[];
    };
}
export declare class FleetHealthError extends Error {
    constructor(message: string);
}
export declare const summarizeFleetHealth: (devices: readonly ManagedDevice[], reports: readonly DeviceHealthReport[], nowMs: number, options?: {
    readonly presence?: PresencePolicy;
    readonly slo?: FleetSlo;
    readonly topN?: number;
    readonly reportMaxAgeMs?: number;
}) => FleetHealthSummary;
//# sourceMappingURL=fleet-health.d.ts.map