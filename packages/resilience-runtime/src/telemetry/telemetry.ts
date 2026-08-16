import type { TelemetrySink } from '../ports/ports.js';
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
export const runtimeMetricNames = [
  'runtime_cycles_total',
  'runtime_cycles_failed_total',
  'runtime_decisions_total',
  'runtime_actions_total',
  'runtime_actions_failed_total',
  'runtime_verifications_failed_total',
  'runtime_recoveries_total',
  'runtime_rollbacks_total',
  'runtime_blocked_total',
  'runtime_degraded_total',
  'runtime_cycle_duration',
  'runtime_decision_confidence',
  'runtime_observation_staleness',
] as const;
