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
 * Keeps local runtime telemetry authoritative when an optional external sink
 * is unavailable. Export/collector failures are evidence, not control-loop
 * failures.
 */
export class ResilientTelemetrySink implements TelemetrySink {
  private readonly local = new InMemoryTelemetrySink();

  constructor(private readonly external?: TelemetrySink) {}

  increment(metric: string, value = 1): void {
    this.local.increment(metric, value);
    this.forward(() => this.external?.increment(metric, value));
  }

  observe(metric: string, value: number): void {
    this.local.observe(metric, value);
    this.forward(() => this.external?.observe(metric, value));
  }

  snapshot(): Readonly<Record<string, number>> {
    return this.local.snapshot();
  }

  private forward(write: () => void): void {
    try {
      write();
    } catch {
      this.local.increment('runtime_telemetry_failures_total');
    }
  }
}
/**
 * Canonical metric registry. This is derived from telemetry classifications so
 * legacy and classified sinks cannot diverge on accepted metric names.
 */
export const runtimeMetricNames: readonly string[] = Object.freeze(
  TELEMETRY_CLASSIFICATIONS.map((entry) => entry.metric),
);
