/**
 * Phase 122 — Network State Prediction.
 *
 * A first-order Markov model with Laplace smoothing over observed state
 * sequences. It predicts the state distribution after n steps and the expected
 * steps to failure, and emits a `PredictiveSignal` compatible with the existing
 * knowledge plane (advisory, expiring). It is explainable by construction: every
 * probability is a smoothed transition frequency.
 */
import type { PredictiveSignal } from '../knowledge/prediction.js';
export declare const NETWORK_STATES: readonly ["healthy", "degraded", "failed"];
export type NetworkStateLabel = (typeof NETWORK_STATES)[number];
export type StateDistribution = Readonly<Record<NetworkStateLabel, number>>;
export interface TransitionModel {
    readonly counts: Readonly<Record<NetworkStateLabel, Readonly<Record<NetworkStateLabel, number>>>>;
    readonly matrix: Readonly<Record<NetworkStateLabel, StateDistribution>>;
    readonly transitions: number;
}
export declare const fitTransitionModel: (sequence: readonly NetworkStateLabel[], smoothing?: number) => TransitionModel;
export declare const predictDistribution: (model: TransitionModel, current: NetworkStateLabel, steps: number) => StateDistribution;
/** Expected steps until first reaching `failed`, via value iteration on the absorbing chain (capped). */
export declare const expectedStepsToFailure: (model: TransitionModel, from: NetworkStateLabel, cap?: number) => number;
export interface StatePredictionOptions {
    readonly stepMs: number;
    readonly horizonSteps: number;
    readonly minTransitions?: number;
    readonly nowMs?: number;
}
/** Emits an advisory signal, or undefined when there is too little history to say anything honest. */
export declare const predictStateSignal: (subjectId: string, sequence: readonly NetworkStateLabel[], options: StatePredictionOptions) => PredictiveSignal | undefined;
//# sourceMappingURL=state-prediction.d.ts.map