/**
 * Phase 122 — Network State Prediction.
 *
 * A first-order Markov model with Laplace smoothing over observed state
 * sequences. It predicts the state distribution after n steps and the expected
 * steps to failure, and emits a `PredictiveSignal` compatible with the existing
 * knowledge plane (advisory, expiring). It is explainable by construction: every
 * probability is a smoothed transition frequency.
 */

import type { PredictiveSignal, PredictiveDirection } from '../knowledge/prediction.js';

export const NETWORK_STATES = ['healthy', 'degraded', 'failed'] as const;
export type NetworkStateLabel = (typeof NETWORK_STATES)[number];
export type StateDistribution = Readonly<Record<NetworkStateLabel, number>>;

export interface TransitionModel {
  readonly counts: Readonly<Record<NetworkStateLabel, Readonly<Record<NetworkStateLabel, number>>>>;
  readonly matrix: Readonly<Record<NetworkStateLabel, StateDistribution>>;
  readonly transitions: number;
}

export const fitTransitionModel = (sequence: readonly NetworkStateLabel[], smoothing = 1): TransitionModel => {
  if (smoothing < 0) throw new Error('smoothing must be non-negative');
  const counts = Object.fromEntries(NETWORK_STATES.map((a) => [a, Object.fromEntries(NETWORK_STATES.map((b) => [b, 0]))])) as Record<NetworkStateLabel, Record<NetworkStateLabel, number>>;
  let transitions = 0;
  for (let i = 1; i < sequence.length; i += 1) { (counts[sequence[i - 1] as NetworkStateLabel])[sequence[i] as NetworkStateLabel] += 1; transitions += 1; }
  const matrix = Object.fromEntries(NETWORK_STATES.map((a) => {
    const row = counts[a];
    const total = NETWORK_STATES.reduce((s, b) => s + row[b], 0) + smoothing * NETWORK_STATES.length;
    return [a, Object.freeze(Object.fromEntries(NETWORK_STATES.map((b) => [b, total === 0 ? 1 / NETWORK_STATES.length : (row[b] + smoothing) / total])) as Record<NetworkStateLabel, number>)];
  })) as Record<NetworkStateLabel, StateDistribution>;
  return Object.freeze({ counts, matrix: Object.freeze(matrix), transitions });
};

const step = (dist: StateDistribution, m: TransitionModel): StateDistribution => {
  const next = { healthy: 0, degraded: 0, failed: 0 } as Record<NetworkStateLabel, number>;
  for (const a of NETWORK_STATES) for (const b of NETWORK_STATES) next[b] += dist[a] * m.matrix[a][b];
  return Object.freeze(next);
};

export const predictDistribution = (model: TransitionModel, current: NetworkStateLabel, steps: number): StateDistribution => {
  if (!Number.isInteger(steps) || steps < 0) throw new Error('steps must be a non-negative integer');
  let dist: StateDistribution = Object.freeze({ healthy: current === 'healthy' ? 1 : 0, degraded: current === 'degraded' ? 1 : 0, failed: current === 'failed' ? 1 : 0 });
  for (let i = 0; i < steps; i += 1) dist = step(dist, model);
  return dist;
};

/** Expected steps until first reaching `failed`, via value iteration on the absorbing chain (capped). */
export const expectedStepsToFailure = (model: TransitionModel, from: NetworkStateLabel, cap = 10_000): number => {
  if (from === 'failed') return 0;
  const t: Record<NetworkStateLabel, number> = { healthy: 0, degraded: 0, failed: 0 };
  for (let iter = 0; iter < cap; iter += 1) {
    let delta = 0;
    for (const s of ['healthy', 'degraded'] as const) {
      const v = 1 + (['healthy', 'degraded'] as const).reduce((sum, n) => sum + model.matrix[s][n] * t[n], 0);
      delta = Math.max(delta, Math.abs(v - t[s])); t[s] = v;
    }
    if (delta < 1e-9) break;
  }
  return t[from];
};

export interface StatePredictionOptions { readonly stepMs: number; readonly horizonSteps: number; readonly minTransitions?: number; readonly nowMs?: number }

/** Emits an advisory signal, or undefined when there is too little history to say anything honest. */
export const predictStateSignal = (subjectId: string, sequence: readonly NetworkStateLabel[], options: StatePredictionOptions): PredictiveSignal | undefined => {
  const model = fitTransitionModel(sequence, 0.5);
  if (model.transitions < (options.minTransitions ?? 8)) return undefined;
  const current = sequence[sequence.length - 1] as NetworkStateLabel;
  const dist = predictDistribution(model, current, options.horizonSteps);
  const unhealthy = dist.degraded + dist.failed;
  const now = predictDistribution(model, current, 0);
  const nowUnhealthy = now.degraded + now.failed;
  const direction: PredictiveDirection = unhealthy - nowUnhealthy > 0.15 ? 'degrading' : nowUnhealthy - unhealthy > 0.15 ? 'improving' : 'stable';
  const confidence = Math.min(0.9, model.transitions / (model.transitions + 20));
  const nowMs = options.nowMs ?? Date.now();
  const horizonMs = options.stepMs * options.horizonSteps;
  return Object.freeze({
    subjectId, direction, confidence, horizonMs, horizonEnd: new Date(nowMs + horizonMs).toISOString(),
    objectiveEvidence: Object.freeze({ availability: Math.max(0, Math.min(1, dist.healthy)) }),
    rationale: `markov(${model.transitions} transitions): P(healthy)=${dist.healthy.toFixed(2)} P(degraded)=${dist.degraded.toFixed(2)} P(failed)=${dist.failed.toFixed(2)} in ${options.horizonSteps} steps`,
  });
};
