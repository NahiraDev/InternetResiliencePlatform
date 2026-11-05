/**
 * Phase 98 — Congestion & Degradation Awareness.
 *
 * Tracks utilisation, loaded-vs-idle latency (bufferbloat) and loss per
 * resource, and classifies congestion with hysteresis so a level only changes
 * after sustained evidence. `applyCongestionToResource` returns a derated copy
 * of a fabric resource for advisory re-ranking; the fabric snapshot itself is
 * never modified here.
 */
import type { FabricResource } from '../fabric.js';
export declare const CONGESTION_LEVELS: readonly ["clear", "elevated", "congested", "saturated"];
export type CongestionLevel = (typeof CONGESTION_LEVELS)[number];
export interface CongestionSample {
    readonly resourceId: string;
    readonly at: string;
    /** Link utilisation 0..1. */
    readonly utilization: number;
    readonly idleLatencyMs?: number;
    readonly loadedLatencyMs?: number;
    /** Packet loss ratio 0..1. */
    readonly lossRatio?: number;
}
export interface CongestionAssessment {
    readonly resourceId: string;
    readonly level: CongestionLevel;
    readonly pressure: number;
    readonly utilization: number;
    readonly latencyInflation: number;
    readonly lossRatio: number;
    readonly bufferbloat: boolean;
    readonly degraded: boolean;
    readonly evaluatedAt: string;
}
export interface CongestionConfig {
    readonly alpha: number;
    /** Pressure thresholds for entering elevated/congested/saturated. */
    readonly enter: readonly [number, number, number];
    /** Pressure must fall this far below the entering threshold to leave a level. */
    readonly exitMargin: number;
    /** Consecutive agreeing evaluations required to change level. */
    readonly confirmations: number;
    readonly bufferbloatInflation: number;
}
export declare const DEFAULT_CONGESTION_CONFIG: CongestionConfig;
export declare class CongestionTracker {
    private readonly config;
    private readonly states;
    constructor(config?: CongestionConfig);
    observe(sample: CongestionSample): CongestionAssessment;
    private levelFor;
    level(resourceId: string): CongestionLevel;
}
/** Returns a derated copy for advisory ranking; never mutates the input. */
export declare const applyCongestionToResource: (resource: FabricResource, assessment: CongestionAssessment) => FabricResource;
//# sourceMappingURL=congestion.d.ts.map