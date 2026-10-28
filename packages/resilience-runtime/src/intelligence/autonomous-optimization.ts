/**
 * Phase 124 — Autonomous Optimization.
 *
 * Bounded, reversible tuning of declared runtime parameters (thresholds,
 * hysteresis margins, timeouts). Each parameter has hard limits and a maximum
 * step; at most one parameter is under trial at a time; a trial is measured
 * against the baseline objective and reverted automatically if it regresses.
 * Proposals are gated by the active intent's autonomy level, and every change
 * is recorded for audit. It tunes parameters only; it never selects actions.
 */

export type AutonomyLevel = 'OBSERVE_ONLY' | 'ADVISORY' | 'SAFE_AUTOMATION' | 'AUTONOMOUS' | 'HIGH_RISK_REQUIRES_APPROVAL';

export interface TunableParameter {
  readonly name: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly maxStep: number;
  /** Direction that increases the objective when moved; used only to seed the first probe. */
  readonly higherIsBetter?: boolean;
}

export interface TuningTrial {
  readonly parameter: string;
  readonly from: number;
  readonly to: number;
  readonly baseline: number;
  readonly startedAtMs: number;
}

export interface TuningRecord {
  readonly parameter: string;
  readonly from: number;
  readonly to: number;
  readonly decision: 'proposed' | 'applied' | 'committed' | 'reverted' | 'rejected';
  readonly reason: string;
  readonly atMs: number;
}

export interface OptimizerOptions {
  readonly cooldownMs?: number;
  readonly trialDurationMs?: number;
  /** Fractional objective regression (e.g. 0.02) that triggers revert. */
  readonly regressionTolerance?: number;
  /** Minimum improvement to commit a trial. */
  readonly improvementThreshold?: number;
  readonly maxChangesPerDay?: number;
}

const mayApply = (level: AutonomyLevel): boolean => level === 'SAFE_AUTOMATION' || level === 'AUTONOMOUS';

export class BoundedParameterOptimizer {
  private readonly params = new Map<string, TunableParameter>();
  private trial: TuningTrial | undefined;
  private readonly log: TuningRecord[] = [];
  private readonly lastChange = new Map<string, number>();
  private readonly changeTimes: number[] = [];
  private readonly o: Required<OptimizerOptions>;

  constructor(parameters: readonly TunableParameter[], options: OptimizerOptions = {}) {
    for (const p of parameters) {
      if (!(p.min <= p.value && p.value <= p.max) || !(p.maxStep > 0)) throw new Error(`invalid tunable parameter ${p.name}`);
      if (this.params.has(p.name)) throw new Error(`duplicate tunable parameter ${p.name}`);
      this.params.set(p.name, Object.freeze({ ...p }));
    }
    this.o = { cooldownMs: 600_000, trialDurationMs: 300_000, regressionTolerance: 0.02, improvementThreshold: 0.01, maxChangesPerDay: 12, ...options };
  }

  current(name: string): number | undefined { return this.params.get(name)?.value; }
  values(): Readonly<Record<string, number>> { return Object.freeze(Object.fromEntries([...this.params.entries()].map(([k, p]) => [k, p.value]))); }
  activeTrial(): TuningTrial | undefined { return this.trial; }
  history(): readonly TuningRecord[] { return Object.freeze([...this.log]); }

  private record(parameter: string, from: number, to: number, decision: TuningRecord['decision'], reason: string, atMs: number) {
    this.log.push(Object.freeze({ parameter, from, to, decision, reason, atMs }));
  }

  /** Starts a trial moving `parameter` toward `target` by at most `maxStep`. Returns the trial or the rejection reason. */
  propose(parameter: string, target: number, baselineObjective: number, autonomy: AutonomyLevel, nowMs: number): { readonly started: boolean; readonly trial?: TuningTrial; readonly reason: string } {
    const p = this.params.get(parameter);
    const reject = (reason: string) => { this.record(parameter, p?.value ?? Number.NaN, target, 'rejected', reason, nowMs); return Object.freeze({ started: false, reason }); };
    if (!p) return reject('unknown-parameter');
    if (!mayApply(autonomy)) return reject(`autonomy-${autonomy.toLowerCase()}-forbids-changes`);
    if (this.trial) return reject('trial-in-progress');
    if (!Number.isFinite(target) || !Number.isFinite(baselineObjective)) return reject('non-finite-input');
    const last = this.lastChange.get(parameter);
    if (last !== undefined && nowMs - last < this.o.cooldownMs) return reject('cooldown');
    while (this.changeTimes.length && nowMs - (this.changeTimes[0] as number) > 86_400_000) this.changeTimes.shift();
    if (this.changeTimes.length >= this.o.maxChangesPerDay) return reject('daily-change-budget-exhausted');
    const clampedTarget = Math.max(p.min, Math.min(p.max, target));
    const delta = clampedTarget - p.value;
    if (delta === 0) return reject('no-change');
    const to = p.value + Math.sign(delta) * Math.min(Math.abs(delta), p.maxStep);
    this.params.set(parameter, Object.freeze({ ...p, value: to }));
    this.trial = Object.freeze({ parameter, from: p.value, to, baseline: baselineObjective, startedAtMs: nowMs });
    this.changeTimes.push(nowMs); this.lastChange.set(parameter, nowMs);
    this.record(parameter, p.value, to, 'applied', 'trial-started', nowMs);
    return Object.freeze({ started: true, trial: this.trial, reason: 'trial-started' });
  }

  /** Feeds the current objective. Reverts early on regression, commits after the trial window if not worse. */
  evaluate(objective: number, nowMs: number): { readonly outcome: 'no-trial' | 'running' | 'reverted' | 'committed'; readonly reason: string } {
    const t = this.trial;
    if (!t) return Object.freeze({ outcome: 'no-trial', reason: 'no-trial' });
    const relative = t.baseline === 0 ? objective - t.baseline : (objective - t.baseline) / Math.abs(t.baseline);
    if (!Number.isFinite(objective) || relative < -this.o.regressionTolerance) {
      const p = this.params.get(t.parameter) as TunableParameter;
      this.params.set(t.parameter, Object.freeze({ ...p, value: t.from }));
      this.trial = undefined;
      this.record(t.parameter, t.to, t.from, 'reverted', Number.isFinite(objective) ? `regression:${relative.toFixed(3)}` : 'non-finite-objective', nowMs);
      return Object.freeze({ outcome: 'reverted', reason: 'objective-regressed' });
    }
    if (nowMs - t.startedAtMs < this.o.trialDurationMs) return Object.freeze({ outcome: 'running', reason: 'trial-window-open' });
    this.trial = undefined;
    if (relative >= this.o.improvementThreshold) { this.record(t.parameter, t.from, t.to, 'committed', `improvement:${relative.toFixed(3)}`, nowMs); return Object.freeze({ outcome: 'committed', reason: 'improved' }); }
    const p = this.params.get(t.parameter) as TunableParameter;
    this.params.set(t.parameter, Object.freeze({ ...p, value: t.from }));
    this.record(t.parameter, t.to, t.from, 'reverted', 'no-meaningful-improvement', nowMs);
    return Object.freeze({ outcome: 'reverted', reason: 'no-improvement' });
  }

  /** Emergency stop: restores the pre-trial value immediately. */
  abort(nowMs: number): boolean {
    const t = this.trial;
    if (!t) return false;
    const p = this.params.get(t.parameter) as TunableParameter;
    this.params.set(t.parameter, Object.freeze({ ...p, value: t.from }));
    this.trial = undefined;
    this.record(t.parameter, t.to, t.from, 'reverted', 'aborted', nowMs);
    return true;
  }
}
