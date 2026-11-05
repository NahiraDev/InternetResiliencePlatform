import { TELEMETRY_CLASSIFICATIONS } from '../events/evidence-sink.js';
export class InMemoryTelemetrySink {
    values = {};
    increment(metric, value = 1) {
        this.values[metric] = (this.values[metric] ?? 0) + value;
    }
    observe(metric, value) {
        this.values[metric] = value;
    }
    snapshot() {
        return Object.freeze({ ...this.values });
    }
}
/**
 * Canonical metric registry. This is derived from telemetry classifications so
 * legacy and classified sinks cannot diverge on accepted metric names.
 */
export const runtimeMetricNames = Object.freeze(TELEMETRY_CLASSIFICATIONS.map((entry) => entry.metric));
//# sourceMappingURL=telemetry.js.map