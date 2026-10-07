import type { TelemetrySink } from '../ports/ports.js';
import { TELEMETRY_CLASSIFICATIONS } from '../events/evidence-sink.js';

export class InMemoryTelemetrySink implements TelemetrySink {
  private values: Record<string, number> = {};
  increment(metric: string, value = 1) {
    this.values[metric] = (this.values[metric] ?? 0) + value;
  }
  observe(metric: string, value: number) {
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
export const runtimeMetricNames: readonly string[] = Object.freeze(
  TELEMETRY_CLASSIFICATIONS.map((entry) => entry.metric),
);
