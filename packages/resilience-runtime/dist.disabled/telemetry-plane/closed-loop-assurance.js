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
export const validateObjectives = (objectives) => {
    const ids = new Set();
    for (const o of objectives) {
        if (!o.id.trim() || ids.has(o.id))
            throw new Error(`assurance objective id missing or duplicated: ${o.id}`);
        ids.add(o.id);
        if (!(o.target > 0 && o.target <= 1))
            throw new Error(`${o.id}: target must be within (0,1]`);
        if (!(o.windowMs > 0) || !(o.minPoints >= 1))
            throw new Error(`${o.id}: windowMs and minPoints must be positive`);
    }
    return Object.freeze([...objectives]);
};
export const evaluateObjective = (store, objective, nowMs) => {
    const points = store.raw(objective.seriesId, nowMs - objective.windowMs, nowMs);
    if (points.length < objective.minPoints) {
        return Object.freeze({ objectiveId: objective.id, state: 'insufficient-data', compliance: 0, points: points.length, errorBudgetRemaining: 0, evaluatedAtMs: nowMs });
    }
    const good = points.filter((p) => (objective.comparator === 'lte' ? p.value <= objective.threshold : p.value >= objective.threshold)).length;
    const compliance = good / points.length;
    const allowedBad = 1 - objective.target;
    const actualBad = 1 - compliance;
    const errorBudgetRemaining = allowedBad === 0 ? (actualBad === 0 ? 1 : -1) : 1 - actualBad / allowedBad;
    const state = compliance >= objective.target ? (errorBudgetRemaining < 0.25 ? 'at-risk' : 'met') : 'violated';
    return Object.freeze({ objectiveId: objective.id, state, compliance, points: points.length, errorBudgetRemaining, evaluatedAtMs: nowMs });
};
export const evaluateObjectives = (store, objectives, nowMs) => Object.freeze(validateObjectives(objectives).map((o) => evaluateObjective(store, o, nowMs)));
export const observationFromAssurance = (objective, status, source = 'phase-106-assurance') => {
    const mapped = status.state === 'met' ? 'healthy' : status.state === 'at-risk' ? 'degraded' : status.state === 'violated' ? 'failed' : 'unknown';
    const iso = new Date(status.evaluatedAtMs).toISOString();
    return Object.freeze({
        id: nextId('obs'), schemaVersion: 1, createdAt: iso, source, metadata: Object.freeze({ objectiveId: objective.id, errorBudgetRemaining: status.errorBudgetRemaining, points: status.points }),
        category: objective.category ?? 'assurance', metric: `assurance.${objective.id}`, value: status.compliance, unit: 'ratio', timestamp: iso, freshnessMs: 0,
        confidence: status.state === 'insufficient-data' ? 0 : Math.min(0.95, 0.5 + status.points / 200),
        severity: mapped === 'healthy' ? 'info' : mapped === 'degraded' || mapped === 'unknown' ? 'warning' : 'critical', status: mapped,
    });
};
/** Standard observation provider so assurance enters the loop through the existing evidence path. */
export class AssuranceObservationProvider {
    store;
    objectives;
    clock;
    id = 'assurance-observations';
    constructor(store, objectives, clock = () => Date.now()) {
        this.store = store;
        this.objectives = objectives;
        this.clock = clock;
        validateObjectives(objectives);
    }
    async collect(_context) {
        const nowMs = this.clock();
        const statuses = evaluateObjectives(this.store, this.objectives, nowMs);
        const byId = new Map(this.objectives.map((o) => [o.id, o]));
        return Object.freeze({
            providerId: this.id, collectedAt: new Date(nowMs).toISOString(), errors: Object.freeze([]),
            observations: Object.freeze(statuses.map((s) => observationFromAssurance(byId.get(s.objectiveId), s))),
        });
    }
}
//# sourceMappingURL=closed-loop-assurance.js.map