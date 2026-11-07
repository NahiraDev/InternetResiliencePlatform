/**
 * Phase 106 — Telemetry-Driven Closed-Loop Assurance.
 *
 * Evaluates declared assurance objectives (SLO-style thresholds with an error
 * budget) against the time-series store and projects violations back into the
 * existing control loop as runtime `Observation`s through a standard
 * `ObservationProvider`. The loop's own admission, arbitration, safety and
 * verification stages decide what happens next; assurance never actuates.
 */
import type { Observation, ObservationProviderResult, RuntimeContext } from '../domain/types.js';
import type { ObservationProvider } from '../ports/ports.js';
import type { TimeSeriesStore } from './time-series.js';
export interface AssuranceObjective {
    readonly id: string;
    readonly seriesId: string;
    readonly description?: string;
    readonly comparator: 'lte' | 'gte';
    readonly threshold: number;
    /** Required ratio of in-window points satisfying the threshold (e.g. 0.99). */
    readonly target: number;
    readonly windowMs: number;
    readonly minPoints: number;
    readonly category?: string;
}
export type AssuranceState = 'met' | 'at-risk' | 'violated' | 'insufficient-data';
export interface AssuranceStatus {
    readonly objectiveId: string;
    readonly state: AssuranceState;
    readonly compliance: number;
    readonly points: number;
    /** Remaining error budget as a fraction of the allowed budget (can be negative). */
    readonly errorBudgetRemaining: number;
    readonly evaluatedAtMs: number;
}
export declare const validateObjectives: (objectives: readonly AssuranceObjective[]) => readonly AssuranceObjective[];
export declare const evaluateObjective: (store: TimeSeriesStore, objective: AssuranceObjective, nowMs: number) => AssuranceStatus;
export declare const evaluateObjectives: (store: TimeSeriesStore, objectives: readonly AssuranceObjective[], nowMs: number) => readonly AssuranceStatus[];
export declare const observationFromAssurance: (objective: AssuranceObjective, status: AssuranceStatus, source?: string) => Observation;
/** Standard observation provider so assurance enters the loop through the existing evidence path. */
export declare class AssuranceObservationProvider implements ObservationProvider {
    private readonly store;
    private readonly objectives;
    private readonly clock;
    readonly id = "assurance-observations";
    constructor(store: TimeSeriesStore, objectives: readonly AssuranceObjective[], clock?: () => number);
    collect(_context: RuntimeContext): Promise<ObservationProviderResult>;
}
//# sourceMappingURL=closed-loop-assurance.d.ts.map