/**
 * Phase 96 — Dynamic Route Optimization.
 *
 * Advisory, bounded re-optimization on top of the fabric selection boundary.
 * It compares the currently active route against the best fresh candidate and
 * recommends a switch only when the improvement clears a hysteresis margin, the
 * dwell time has elapsed and the flap budget is not exhausted. The output is a
 * `CandidateAction` for the canonical planning/closed-loop path; this module
 * never executes a change.
 */

import { stableId } from '../domain/ids.js';
import type { CandidateAction } from '../domain/types.js';
import type { FabricResource, FabricSelectionRequest, FabricSelectionResult, ProgrammableConnectivityFabric } from '../fabric.js';
import { parseTime } from '../analytics/series.js';

export interface RouteOptimizationConfig {
  /** Minimum relative score improvement (0..1) required to recommend a switch. */
  readonly improvementMargin: number;
  /** Minimum time the current route must have been active before switching. */
  readonly minDwellMs: number;
  /** Maximum recommended switches per window. */
  readonly maxSwitchesPerWindow: number;
  readonly windowMs: number;
}

export const DEFAULT_ROUTE_OPTIMIZATION_CONFIG: RouteOptimizationConfig = Object.freeze({
  improvementMargin: 0.1,
  minDwellMs: 60_000,
  maxSwitchesPerWindow: 3,
  windowMs: 15 * 60_000,
});

export type RouteOptimizationVerdict = 'keep' | 'switch' | 'hold' | 'unavailable';

export interface RouteOptimizationRecommendation {
  readonly verdict: RouteOptimizationVerdict;
  readonly currentId?: string;
  readonly proposedId?: string;
  readonly currentScore?: number;
  readonly proposedScore?: number;
  readonly improvement: number;
  readonly reasons: readonly string[];
  readonly selection: FabricSelectionResult;
  readonly evaluatedAt: string;
}

const costOf = (r: FabricResource): number => Object.values(r.cost).reduce((s, v) => s + Math.max(0, v), 0);

/** Route score in [0,100]; mirrors the fabric ranking inputs without redefining selection. */
export const routeScore = (r: FabricResource): number =>
  Math.max(0, Math.min(100, r.health.score * 0.45 + r.confidence * 100 * 0.25 + r.trust * 100 * 0.2 - costOf(r) * 0.1 + 10));

export interface ActiveRoute { readonly resourceId: string; readonly activeSince: string }

export class RouteOptimizationAdvisor {
  private readonly switches: number[] = [];
  constructor(
    private readonly fabric: Pick<ProgrammableConnectivityFabric, 'select' | 'snapshotState'>,
    private readonly config: RouteOptimizationConfig = DEFAULT_ROUTE_OPTIMIZATION_CONFIG,
  ) {
    if (config.improvementMargin < 0 || config.improvementMargin > 1) throw new Error('improvementMargin must be within [0,1]');
    if (config.maxSwitchesPerWindow < 0 || config.minDwellMs < 0 || config.windowMs <= 0) throw new Error('invalid route optimization config');
  }

  /** Records that a recommended switch was actually applied by the runtime. */
  recordApplied(at: string): void {
    const t = parseTime(at);
    if (Number.isFinite(t)) this.switches.push(t);
  }

  private recentSwitches(now: number): number {
    return this.switches.filter((t) => now - t <= this.config.windowMs).length;
  }

  evaluate(active: ActiveRoute, request: FabricSelectionRequest, now: string): RouteOptimizationRecommendation {
    const selection = this.fabric.select({ ...request, now });
    const nowMs = parseTime(now);
    const current = this.fabric.snapshotState().resources.find((r) => r.id === active.resourceId);
    const proposed = selection.selected;
    const base = { selection, evaluatedAt: now, ...(current ? { currentId: current.id } : { currentId: active.resourceId }) };
    if (!proposed) {
      return Object.freeze({ ...base, verdict: 'unavailable', improvement: 0, reasons: Object.freeze([selection.reason]) });
    }
    const proposedScore = routeScore(proposed);
    const currentEligible = current !== undefined && selection.candidates.some((c) => c.id === current.id);
    if (!currentEligible) {
      // The active route no longer qualifies; a switch is required regardless of margin or dwell.
      const exhausted = this.recentSwitches(nowMs) >= this.config.maxSwitchesPerWindow;
      return Object.freeze({
        ...base, verdict: exhausted ? 'hold' : 'switch', proposedId: proposed.id, proposedScore, improvement: 1,
        reasons: Object.freeze([exhausted ? 'flap-budget-exhausted-current-ineligible' : 'current-route-ineligible']),
      });
    }
    if (proposed.id === current.id) {
      return Object.freeze({ ...base, verdict: 'keep', currentScore: routeScore(current), proposedId: proposed.id, proposedScore, improvement: 0, reasons: Object.freeze(['current-route-is-best']) });
    }
    const currentScore = routeScore(current);
    const improvement = currentScore <= 0 ? 1 : (proposedScore - currentScore) / currentScore;
    const reasons: string[] = [];
    if (improvement < this.config.improvementMargin) reasons.push('improvement-below-hysteresis-margin');
    const dwell = nowMs - parseTime(active.activeSince);
    if (!(dwell >= this.config.minDwellMs)) reasons.push('minimum-dwell-not-elapsed');
    if (this.recentSwitches(nowMs) >= this.config.maxSwitchesPerWindow) reasons.push('flap-budget-exhausted');
    const verdict: RouteOptimizationVerdict = reasons.length === 0 ? 'switch' : improvement < this.config.improvementMargin ? 'keep' : 'hold';
    return Object.freeze({
      ...base, verdict, currentScore, proposedId: proposed.id, proposedScore, improvement,
      reasons: Object.freeze(reasons.length ? reasons : ['improvement-clears-margin']),
    });
  }
}

/** Converts a `switch` recommendation into a planner-visible candidate; other verdicts yield nothing. */
export const toRouteChangeCandidate = (rec: RouteOptimizationRecommendation, correlationId?: string): CandidateAction | undefined => {
  if (rec.verdict !== 'switch' || !rec.proposedId) return undefined;
  return Object.freeze({
    id: stableId('route-opt', `${rec.currentId ?? 'none'}->${rec.proposedId}@${rec.evaluatedAt}`),
    schemaVersion: 1,
    createdAt: rec.evaluatedAt,
    ...(correlationId ? { correlationId } : {}),
    source: 'phase-96-route-optimization',
    metadata: Object.freeze({ currentId: rec.currentId, proposedId: rec.proposedId, improvement: rec.improvement, criteria: rec.selection.audit.criteria }),
    intent: 'route_change',
    expectedBenefit: Math.max(0, Math.min(1, rec.improvement)),
    risk: 0.25,
    confidence: Math.max(0, Math.min(1, (rec.proposedScore ?? 0) / 100)),
    requiredCapabilities: Object.freeze(['route_change']),
    dependencies: Object.freeze([]),
    postconditions: Object.freeze([`active-route:${rec.proposedId}`]),
    verificationRequirements: Object.freeze(['route-health-verified', 'service-reachability-verified']),
    rollbackStrategy: `restore-route:${rec.currentId ?? 'previous'}`,
    rejectionReasons: Object.freeze([]),
  });
};
