export type SloStatus = 'met' | 'breached';
export interface SloWindow {
    totalRequests: number;
    successfulRequests: number;
    totalLatencyMs: number;
    latencySamples: number;
    windowSeconds: number;
}
export interface SloTarget {
    availability: number;
    maxAverageLatencyMs: number;
}
export interface SloEvaluation {
    status: SloStatus;
    availability: number;
    averageLatencyMs: number;
    errorBudget: number;
    errorBudgetRemaining: number;
    availabilityMet: boolean;
    latencyMet: boolean;
}
export declare const evaluateSlo: (window: SloWindow, target: SloTarget) => SloEvaluation;
//# sourceMappingURL=slo.d.ts.map