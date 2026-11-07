/**
 * Phase 102 — Cross-Layer Event Correlation.
 *
 * Groups telemetry records from different network layers that share a
 * correlation id, resource lineage or tight time proximity, and orders the
 * evidence by causal layer so the lowest failing layer is reported as the root
 * cause candidate. Pure analysis: it classifies evidence, it does not act.
 */
import type { TelemetryRecord } from './unified-telemetry.js';
/** Lowest layer first; a failure at a lower layer explains failures above it. */
export declare const CAUSAL_LAYERS: readonly ["physical", "link", "network", "tunnel", "transport", "dns", "gateway", "application"];
export type CausalLayer = (typeof CAUSAL_LAYERS)[number];
export interface CorrelationConfig {
    readonly windowMs: number;
    /** Names with these suffixes/labels are treated as failures. */
    readonly failureLabel: string;
    readonly failureValues: readonly string[];
}
export declare const DEFAULT_CORRELATION_CONFIG: CorrelationConfig;
export interface CorrelatedGroup {
    readonly groupId: string;
    readonly records: readonly TelemetryRecord[];
    readonly layers: readonly CausalLayer[];
    readonly rootCauseLayer?: CausalLayer;
    readonly rootCauseResource?: string;
    readonly downstreamLayers: readonly CausalLayer[];
    readonly confidence: number;
    readonly startMs: number;
    readonly endMs: number;
    readonly reasons: readonly string[];
}
export declare const correlateTelemetry: (input: readonly TelemetryRecord[], config?: CorrelationConfig) => readonly CorrelatedGroup[];
//# sourceMappingURL=correlation.d.ts.map