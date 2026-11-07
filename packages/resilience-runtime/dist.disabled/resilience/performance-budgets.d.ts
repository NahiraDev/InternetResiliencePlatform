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
export declare const DEFAULT_PERFORMANCE_BUDGETS: PerformanceBudgets;
export declare const checkPerformanceBudgets: (snapshot: PerformanceSnapshot, budgets?: PerformanceBudgets) => readonly BudgetViolation[];
export declare const isWithinBudgets: (snapshot: PerformanceSnapshot, budgets?: PerformanceBudgets) => boolean;
//# sourceMappingURL=performance-budgets.d.ts.map