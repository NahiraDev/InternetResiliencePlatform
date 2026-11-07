import type { TelemetrySink } from '../ports/ports.js';
export declare class InMemoryTelemetrySink implements TelemetrySink {
    private values;
    increment(metric: string, value?: number): void;
    observe(metric: string, value: number): void;
    snapshot(): Readonly<{
        [x: string]: number;
    }>;
}
/**
 * Canonical metric registry. This is derived from telemetry classifications so
 * legacy and classified sinks cannot diverge on accepted metric names.
 */
export declare const runtimeMetricNames: readonly string[];
//# sourceMappingURL=telemetry.d.ts.map