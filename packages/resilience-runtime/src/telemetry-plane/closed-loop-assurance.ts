/**
 * Phase 106 — Telemetry-Driven Closed-Loop Assurance.
 *
 * Evaluates declared assurance objectives (SLO-style thresholds with an error
 * budget) against the time-series store and projects violations back into the
 * existing control loop as runtime `Observation`s through a standard
 * `ObservationProvider`. The loop's own admission, arbitration, safety and
 * verification stages decide what happens next; assurance never actuates.
 */

import { nextId } from '../domain/ids.js';
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

export const validateObjectives = (objectives: readonly AssuranceObjective[]): readonly AssuranceObjective[] => {
  const ids = new Set<string>();
  for (const o of objectives) {
    if (!o.id.trim() || ids.has(o.id)) throw new Error(`assurance objective id missing or duplicated: ${o.id}`);
    ids.add(o.id);
    if (!(o.target > 0 && o.target <= 1)) throw new Error(`${o.id}: target must be within (0,1]`);
    if (!(o.windowMs > 0) || !(o.minPoints >= 1)) throw new Error(`${o.id}: windowMs and minPoints must be positive`);
  }
  return Object.freeze([...objectives]);
};

export const evaluateObjective = (store: TimeSeriesStore, objective: AssuranceObjective, nowMs: number): AssuranceStatus => {
  const points = store.raw(objective.seriesId, nowMs - objective.windowMs, nowMs);
  if (points.length < objective.minPoints) {
    return Object.freeze({ objectiveId: objective.id, state: 'insufficient-data', compliance: 0, points: points.length, errorBudgetRemaining: 0, evaluatedAtMs: nowMs });
  }
  const good = points.filter((p) => (objective.comparator === 'lte' ? p.value <= objective.threshold : p.value >= objective.threshold)).length;
  const compliance = good / points.length;
  const allowedBad = 1 - objective.target;
  const actualBad = 1 - compliance;
  const errorBudgetRemaining = allowedBad === 0 ? (actualBad === 0 ? 1 : -1) : 1 - actualBad / allowedBad;
  const state: AssuranceState = compliance >= objective.target ? (errorBudgetRemaining < 0.25 ? 'at-risk' : 'met') : 'violated';
  return Object.freeze({ objectiveId: objective.id, state, compliance, points: points.length, errorBudgetRemaining, evaluatedAtMs: nowMs });
};

export const evaluateObjectives = (store: TimeSeriesStore, objectives: readonly AssuranceObjective[], nowMs: number): readonly AssuranceStatus[] =>
  Object.freeze(validateObjectives(objectives).map((o) => evaluateObjective(store, o, nowMs)));

export const observationFromAssurance = (objective: AssuranceObjective, status: AssuranceStatus, source = 'phase-106-assurance'): Observation => {
  const mapped: Observation['status'] = status.state === 'met' ? 'healthy' : status.state === 'at-risk' ? 'degraded' : status.state === 'violated' ? 'failed' : 'unknown';
  const iso = new Date(status.evaluatedAtMs).toISOString();
  return Object.freeze({
    id: nextId('obs'), schemaVersion: 1, createdAt: iso, source, metadata: Object.freeze({ objectiveId: objective.id, errorBudgetRemaining: status.errorBudgetRemaining, points: status.points }),
    category: objective.category ?? 'assurance', metric: `assurance.${objective.id}`, value: status.compliance, unit: 'ratio', timestamp: iso, freshnessMs: 0,
    confidence: status.state === 'insufficient-data' ? 0 : Math.min(0.95, 0.5 + status.points / 200),
    severity: mapped === 'healthy' ? 'info' : mapped === 'degraded' || mapped === 'unknown' ? 'warning' : 'critical', status: mapped,
  });
};

/** Standard observation provider so assurance enters the loop through the existing evidence path. */
export class AssuranceObservationProvider implements ObservationProvider {
  readonly id = 'assurance-observations';
  constructor(
    private readonly store: TimeSeriesStore,
    private readonly objectives: readonly AssuranceObjective[],
    private readonly clock: () => number = () => Date.now(),
  ) { validateObjectives(objectives); }
  async collect(_context: RuntimeContext): Promise<ObservationProviderResult> {
    const nowMs = this.clock();
    const statuses = evaluateObjectives(this.store, this.objectives, nowMs);
    const byId = new Map(this.objectives.map((o) => [o.id, o]));
    return Object.freeze({
      providerId: this.id, collectedAt: new Date(nowMs).toISOString(), errors: Object.freeze([]),
      observations: Object.freeze(statuses.map((s) => observationFromAssurance(byId.get(s.objectiveId) as AssuranceObjective, s))),
    });
  }
}
