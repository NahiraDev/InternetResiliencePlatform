/**
 * Measurable performance budgets for issue #283.
 * Pure helpers only: measurement/collection stays with the existing
 * telemetry owners; this module owns budget definition and evaluation.
 */

export interface PerformanceBudgets {
  /** Maximum healthy CPU utilization as a fraction in (0, 1]. */
  readonly maxCpuUtilization: number;
  /** Maximum healthy heap usage in bytes. */
  readonly maxHeapUsedBytes: number;
  /** Maximum healthy end-to-end runtime cycle latency in milliseconds. */
  readonly maxCycleLatencyMs: number;
  /** Maximum healthy retained queue depth (messages). */
  readonly maxQueueDepth: number;
  /** Maximum healthy inbound network-event rate (events/second). */
  readonly maxEventsPerSecond: number;
}

export interface PerformanceSnapshot {
  readonly cpuUtilization?: number;
  readonly heapUsedBytes?: number;
  readonly cycleLatencyMs?: number;
  readonly queueDepth?: number;
  readonly eventsPerSecond?: number;
}

export interface BudgetViolation {
  readonly budget: keyof PerformanceBudgets;
  readonly observed: number;
  readonly limit: number;
}

export const DEFAULT_PERFORMANCE_BUDGETS: PerformanceBudgets = Object.freeze({
  maxCpuUtilization: 0.8,
  maxHeapUsedBytes: 512 * 1024 * 1024,
  maxCycleLatencyMs: 2_000,
  maxQueueDepth: 1_000,
  maxEventsPerSecond: 500,
});

export const checkPerformanceBudgets = (
  snapshot: PerformanceSnapshot,
  budgets: PerformanceBudgets = DEFAULT_PERFORMANCE_BUDGETS,
): readonly BudgetViolation[] => {
  const violations: BudgetViolation[] = [];
  const pairs: ReadonlyArray<readonly [keyof PerformanceBudgets, number | undefined]> = [
    ['maxCpuUtilization', snapshot.cpuUtilization],
    ['maxHeapUsedBytes', snapshot.heapUsedBytes],
    ['maxCycleLatencyMs', snapshot.cycleLatencyMs],
    ['maxQueueDepth', snapshot.queueDepth],
    ['maxEventsPerSecond', snapshot.eventsPerSecond],
  ];
  for (const [budget, observed] of pairs) {
    if (observed === undefined || !Number.isFinite(observed)) continue;
    const limit = budgets[budget];
    if (observed > limit) violations.push({ budget, observed, limit });
  }
  return Object.freeze(violations);
};

export const isWithinBudgets = (
  snapshot: PerformanceSnapshot,
  budgets: PerformanceBudgets = DEFAULT_PERFORMANCE_BUDGETS,
): boolean => checkPerformanceBudgets(snapshot, budgets).length === 0;
