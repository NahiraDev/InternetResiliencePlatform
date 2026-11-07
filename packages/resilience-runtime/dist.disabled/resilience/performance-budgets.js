/**
 * Measurable performance budgets for issue #283.
 * Pure helpers only: measurement/collection stays with the existing
 * telemetry owners; this module owns budget definition and evaluation.
 */
export const DEFAULT_PERFORMANCE_BUDGETS = Object.freeze({
    maxCpuUtilization: 0.8,
    maxHeapUsedBytes: 512 * 1024 * 1024,
    maxCycleLatencyMs: 2_000,
    maxQueueDepth: 1_000,
    maxEventsPerSecond: 500,
});
export const checkPerformanceBudgets = (snapshot, budgets = DEFAULT_PERFORMANCE_BUDGETS) => {
    const violations = [];
    const pairs = [
        ['maxCpuUtilization', snapshot.cpuUtilization],
        ['maxHeapUsedBytes', snapshot.heapUsedBytes],
        ['maxCycleLatencyMs', snapshot.cycleLatencyMs],
        ['maxQueueDepth', snapshot.queueDepth],
        ['maxEventsPerSecond', snapshot.eventsPerSecond],
    ];
    for (const [budget, observed] of pairs) {
        if (observed === undefined || !Number.isFinite(observed))
            continue;
        const limit = budgets[budget];
        if (observed > limit)
            violations.push({ budget, observed, limit });
    }
    return Object.freeze(violations);
};
export const isWithinBudgets = (snapshot, budgets = DEFAULT_PERFORMANCE_BUDGETS) => checkPerformanceBudgets(snapshot, budgets).length === 0;
//# sourceMappingURL=performance-budgets.js.map