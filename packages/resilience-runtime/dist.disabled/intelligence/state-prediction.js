/**
 * Phase 122 — Network State Prediction.
 *
 * A first-order Markov model with Laplace smoothing over observed state
 * sequences. It predicts the state distribution after n steps and the expected
 * steps to failure, and emits a `PredictiveSignal` compatible with the existing
 * knowledge plane (advisory, expiring). It is explainable by construction: every
 * probability is a smoothed transition frequency.
 */
export const NETWORK_STATES = ['healthy', 'degraded', 'failed'];
export const fitTransitionModel = (sequence, smoothing = 1) => {
    if (smoothing < 0)
        throw new Error('smoothing must be non-negative');
    const counts = Object.fromEntries(NETWORK_STATES.map((a) => [a, Object.fromEntries(NETWORK_STATES.map((b) => [b, 0]))]));
    let transitions = 0;
    for (let i = 1; i < sequence.length; i += 1) {
        (counts[sequence[i - 1]])[sequence[i]] += 1;
        transitions += 1;
    }
    const matrix = Object.fromEntries(NETWORK_STATES.map((a) => {
        const row = counts[a];
        const total = NETWORK_STATES.reduce((s, b) => s + row[b], 0) + smoothing * NETWORK_STATES.length;
        return [a, Object.freeze(Object.fromEntries(NETWORK_STATES.map((b) => [b, total === 0 ? 1 / NETWORK_STATES.length : (row[b] + smoothing) / total])))];
    }));
    return Object.freeze({ counts, matrix: Object.freeze(matrix), transitions });
};
const step = (dist, m) => {
    const next = { healthy: 0, degraded: 0, failed: 0 };
    for (const a of NETWORK_STATES)
        for (const b of NETWORK_STATES)
            next[b] += dist[a] * m.matrix[a][b];
    return Object.freeze(next);
};
export const predictDistribution = (model, current, steps) => {
    if (!Number.isInteger(steps) || steps < 0)
        throw new Error('steps must be a non-negative integer');
    let dist = Object.freeze({ healthy: current === 'healthy' ? 1 : 0, degraded: current === 'degraded' ? 1 : 0, failed: current === 'failed' ? 1 : 0 });
    for (let i = 0; i < steps; i += 1)
        dist = step(dist, model);
    return dist;
};
/** Expected steps until first reaching `failed`, via value iteration on the absorbing chain (capped). */
export const expectedStepsToFailure = (model, from, cap = 10_000) => {
    if (from === 'failed')
        return 0;
    const t = { healthy: 0, degraded: 0, failed: 0 };
    for (let iter = 0; iter < cap; iter += 1) {
        let delta = 0;
        for (const s of ['healthy', 'degraded']) {
            const v = 1 + ['healthy', 'degraded'].reduce((sum, n) => sum + model.matrix[s][n] * t[n], 0);
            delta = Math.max(delta, Math.abs(v - t[s]));
            t[s] = v;
        }
        if (delta < 1e-9)
            break;
    }
    return t[from];
};
/** Emits an advisory signal, or undefined when there is too little history to say anything honest. */
export const predictStateSignal = (subjectId, sequence, options) => {
    const model = fitTransitionModel(sequence, 0.5);
    if (model.transitions < (options.minTransitions ?? 8))
        return undefined;
    const current = sequence[sequence.length - 1];
    const dist = predictDistribution(model, current, options.horizonSteps);
    const unhealthy = dist.degraded + dist.failed;
    const now = predictDistribution(model, current, 0);
    const nowUnhealthy = now.degraded + now.failed;
    const direction = unhealthy - nowUnhealthy > 0.15 ? 'degrading' : nowUnhealthy - unhealthy > 0.15 ? 'improving' : 'stable';
    const confidence = Math.min(0.9, model.transitions / (model.transitions + 20));
    const nowMs = options.nowMs ?? Date.now();
    const horizonMs = options.stepMs * options.horizonSteps;
    return Object.freeze({
        subjectId, direction, confidence, horizonMs, horizonEnd: new Date(nowMs + horizonMs).toISOString(),
        objectiveEvidence: Object.freeze({ availability: Math.max(0, Math.min(1, dist.healthy)) }),
        rationale: `markov(${model.transitions} transitions): P(healthy)=${dist.healthy.toFixed(2)} P(degraded)=${dist.degraded.toFixed(2)} P(failed)=${dist.failed.toFixed(2)} in ${options.horizonSteps} steps`,
    });
};
//# sourceMappingURL=state-prediction.js.map