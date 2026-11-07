/**
 * Caching/deduplication and adaptive polling for issue #283.
 * Prevents duplicate network observations from amplifying into duplicate work.
 */
export interface DedupAdmission {
    readonly admitted: boolean;
    readonly duplicate: boolean;
}
export declare class ObservationDedupCache {
    private readonly ttlMs;
    private readonly maxKeys;
    private readonly seen;
    private hitsTotal;
    private admittedTotal;
    constructor(ttlMs?: number, maxKeys?: number);
    admit(key: string, nowMs?: number): DedupAdmission;
    status(): Readonly<{
        keys: number;
        admittedTotal: number;
        duplicateHitsTotal: number;
    }>;
}
export interface AdaptivePollingConfig {
    readonly baseIntervalMs: number;
    readonly minIntervalMs: number;
    readonly maxIntervalMs: number;
    readonly backoffFactor: number;
    readonly recoveryFactor: number;
}
/**
 * Lengthens the poll interval while observations are stable, shortens it
 * while degradation is observed. Always stays within [min, max].
 */
export declare const nextPollInterval: (currentIntervalMs: number, degraded: boolean, config: AdaptivePollingConfig) => number;
//# sourceMappingURL=observation-dedup.d.ts.map