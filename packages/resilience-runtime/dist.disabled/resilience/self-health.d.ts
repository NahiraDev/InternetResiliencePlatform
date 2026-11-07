/**
 * Self-health diagnostics for issue #283.
 * Answers "is IRP itself healthy?" independently of network observations,
 * so operators can distinguish daemon distress from network distress.
 */
import { type PerformanceBudgets, type PerformanceSnapshot } from './performance-budgets.js';
export type SelfHealthLevel = 'healthy' | 'degraded' | 'critical';
export interface SelfHealthInput {
    readonly schedulerActive: number;
    readonly schedulerFailedTotal: number;
    readonly schedulerOverlapPreventedTotal: number;
    readonly queueDepth: number;
    readonly queueRejectedTotal: number;
    readonly telemetryFailuresTotal: number;
    readonly performance: PerformanceSnapshot;
    readonly budgets?: PerformanceBudgets;
}
export interface SelfHealthReport {
    readonly level: SelfHealthLevel;
    readonly reasons: readonly string[];
}
export declare const evaluateSelfHealth: (input: SelfHealthInput) => SelfHealthReport;
//# sourceMappingURL=self-health.d.ts.map