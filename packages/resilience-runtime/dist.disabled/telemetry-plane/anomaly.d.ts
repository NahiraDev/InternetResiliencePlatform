/**
 * Phase 105 — Anomaly Detection.
 *
 * Deterministic, explainable detectors: robust z-score (median/MAD), an EWMA
 * control band and a one-sided CUSUM change-point test. Detection requires a
 * warm-up baseline and applies a cooldown to avoid alert storms. Detectors emit
 * findings only; they have no actuation path.
 */
export type AnomalyMethod = 'robust-zscore' | 'ewma-band' | 'cusum';
export type AnomalySeverity = 'low' | 'medium' | 'high';
export interface AnomalyFinding {
    readonly seriesId: string;
    readonly atMs: number;
    readonly value: number;
    readonly method: AnomalyMethod;
    readonly score: number;
    readonly direction: 'up' | 'down';
    readonly severity: AnomalySeverity;
    readonly baseline: number;
    readonly reason: string;
}
export interface AnomalyConfig {
    readonly warmup: number;
    readonly baselineSize: number;
    readonly zThreshold: number;
    readonly ewmaAlpha: number;
    readonly ewmaSigmas: number;
    readonly cusumSlack: number;
    readonly cusumThreshold: number;
    readonly cooldownMs: number;
}
export declare const DEFAULT_ANOMALY_CONFIG: AnomalyConfig;
export declare class AnomalyDetector {
    private readonly config;
    private readonly state;
    constructor(config?: AnomalyConfig);
    /** Observes one point and returns any findings it triggers (never throws on bad input; ignores non-finite). */
    observe(seriesId: string, atMs: number, value: number): readonly AnomalyFinding[];
    private maybePush;
}
//# sourceMappingURL=anomaly.d.ts.map