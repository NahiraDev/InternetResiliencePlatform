/**
 * Phase 138 — Capability Discovery & Provider Directory.
 *
 * A directory of providers keyed by the capabilities they offer, with semantic
 * version ranges, heartbeat-based liveness and deterministic resolution.
 * Discovery is read-only metadata: selecting a provider here grants no
 * authority; resources are still admitted through the fabric.
 */
export interface ProviderCapability {
    readonly name: string;
    readonly version: string;
}
export interface ProviderListing {
    readonly id: string;
    readonly capabilities: readonly ProviderCapability[];
    readonly region?: string;
    readonly priority: number;
    readonly heartbeatTtlMs: number;
    readonly lastHeartbeatMs: number;
}
export interface CapabilityQuery {
    readonly capability: string;
    readonly range?: string;
    readonly region?: string;
    readonly excludeProviders?: readonly string[];
}
export interface Resolution {
    readonly providerId: string;
    readonly capability: ProviderCapability;
    readonly alive: true;
}
export declare class CapabilityDirectory {
    private readonly listings;
    announce(listing: Omit<ProviderListing, 'lastHeartbeatMs'>, nowMs: number): void;
    heartbeat(id: string, nowMs: number): boolean;
    withdraw(id: string): boolean;
    isAlive(id: string, nowMs: number): boolean;
    /** All matching live providers, best first: region match, higher version, higher priority, then id. */
    discover(query: CapabilityQuery, nowMs: number): readonly Resolution[];
    resolve(query: CapabilityQuery, nowMs: number): Resolution | undefined;
    /** Capabilities currently offered by no live provider but required: the gaps. */
    gaps(required: readonly string[], nowMs: number): readonly string[];
    /** Removes listings dead for longer than `graceMs` past their TTL. */
    sweep(nowMs: number, graceMs?: number): readonly string[];
}
//# sourceMappingURL=capability-directory.d.ts.map