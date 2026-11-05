/**
 * Phase 97 — Service Reachability Intelligence.
 *
 * Maintains bounded probe evidence per (service, path) and derives a
 * reachability verdict with explicit failure-layer attribution. Pure state
 * machine over injected timestamps; probing itself is performed by existing
 * observation providers.
 */
export type ProbeLayer = 'dns' | 'tcp' | 'tls' | 'http' | 'icmp' | 'application';
export interface ReachabilityProbe {
    readonly serviceId: string;
    readonly pathId: string;
    readonly at: string;
    readonly ok: boolean;
    readonly latencyMs?: number;
    /** Layer at which the probe failed; required when `ok` is false. */
    readonly failedLayer?: ProbeLayer;
}
export type ReachabilityState = 'reachable' | 'degraded' | 'unreachable' | 'unknown';
export interface ReachabilityVerdict {
    readonly serviceId: string;
    readonly pathId: string;
    readonly state: ReachabilityState;
    readonly successRatio: number;
    readonly samples: number;
    readonly confidence: number;
    readonly dominantFailureLayer?: ProbeLayer;
    readonly p50LatencyMs?: number;
    readonly consecutiveFailures: number;
    readonly lastProbeAt?: string;
    readonly stale: boolean;
}
export interface ReachabilityConfig {
    readonly windowSize: number;
    readonly maxAgeMs: number;
    readonly minSamples: number;
    readonly reachableRatio: number;
    readonly unreachableRatio: number;
}
export declare const DEFAULT_REACHABILITY_CONFIG: ReachabilityConfig;
export declare class ServiceReachabilityLedger {
    private readonly config;
    private readonly tracks;
    constructor(config?: ReachabilityConfig);
    private key;
    record(probe: ReachabilityProbe): void;
    verdict(serviceId: string, pathId: string, now: string): ReachabilityVerdict;
    /** Verdicts for one service across every known path, best state first. */
    servicePaths(serviceId: string, now: string): readonly ReachabilityVerdict[];
    /** Service-level verdict: reachable if any path is, i.e. an outage only when every path is down. */
    serviceState(serviceId: string, now: string): ReachabilityState;
}
//# sourceMappingURL=reachability.d.ts.map