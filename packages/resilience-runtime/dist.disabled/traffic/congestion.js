/**
 * Phase 98 — Congestion & Degradation Awareness.
 *
 * Tracks utilisation, loaded-vs-idle latency (bufferbloat) and loss per
 * resource, and classifies congestion with hysteresis so a level only changes
 * after sustained evidence. `applyCongestionToResource` returns a derated copy
 * of a fabric resource for advisory re-ranking; the fabric snapshot itself is
 * never modified here.
 */
import { clamp, ewma, parseTime } from '../analytics/series.js';
export const CONGESTION_LEVELS = ['clear', 'elevated', 'congested', 'saturated'];
export const DEFAULT_CONGESTION_CONFIG = Object.freeze({
    alpha: 0.4, enter: [0.35, 0.6, 0.85], exitMargin: 0.08, confirmations: 2, bufferbloatInflation: 3,
});
const levelIndex = (l) => CONGESTION_LEVELS.indexOf(l);
export class CongestionTracker {
    config;
    states = new Map();
    constructor(config = DEFAULT_CONGESTION_CONFIG) {
        this.config = config;
        if (config.confirmations < 1)
            throw new Error('confirmations must be >= 1');
    }
    observe(sample) {
        if (!Number.isFinite(parseTime(sample.at)))
            throw new Error('congestion sample timestamp is invalid');
        let st = this.states.get(sample.resourceId);
        if (!st) {
            st = { util: [], infl: [], loss: [], level: 'clear', pending: undefined, pendingCount: 0 };
            this.states.set(sample.resourceId, st);
        }
        st.util.push(clamp(sample.utilization, 0, 1));
        const inflation = sample.idleLatencyMs && sample.idleLatencyMs > 0 && sample.loadedLatencyMs !== undefined
            ? Math.max(1, sample.loadedLatencyMs / sample.idleLatencyMs) : 1;
        st.infl.push(inflation);
        st.loss.push(clamp(sample.lossRatio ?? 0, 0, 1));
        for (const series of [st.util, st.infl, st.loss])
            while (series.length > 32)
                series.shift();
        const util = ewma(st.util, this.config.alpha);
        const infl = ewma(st.infl, this.config.alpha);
        const loss = ewma(st.loss, this.config.alpha);
        const inflationPressure = clamp((infl - 1) / (this.config.bufferbloatInflation * 2), 0, 1);
        const lossPressure = clamp(loss / 0.05, 0, 1);
        const pressure = clamp(Math.max(util * 0.7 + inflationPressure * 0.3, lossPressure), 0, 1);
        const target = this.levelFor(pressure, st.level);
        if (target === st.level) {
            st.pending = undefined;
            st.pendingCount = 0;
        }
        else if (st.pending === target) {
            st.pendingCount += 1;
            if (st.pendingCount >= this.config.confirmations) {
                st.level = target;
                st.pending = undefined;
                st.pendingCount = 0;
            }
        }
        else {
            st.pending = target;
            st.pendingCount = 1;
            if (this.config.confirmations === 1) {
                st.level = target;
                st.pending = undefined;
                st.pendingCount = 0;
            }
        }
        return Object.freeze({
            resourceId: sample.resourceId, level: st.level, pressure, utilization: util, latencyInflation: infl, lossRatio: loss,
            bufferbloat: infl >= this.config.bufferbloatInflation, degraded: levelIndex(st.level) >= 2 || loss >= 0.02, evaluatedAt: sample.at,
        });
    }
    levelFor(pressure, current) {
        const [e, c, s] = this.config.enter;
        let raw = pressure >= s ? 'saturated' : pressure >= c ? 'congested' : pressure >= e ? 'elevated' : 'clear';
        if (levelIndex(raw) < levelIndex(current)) {
            // Hysteresis: stay at the current level until pressure clears its entry threshold by the exit margin.
            const entry = [0, e, c, s][levelIndex(current)];
            if (pressure > entry - this.config.exitMargin)
                raw = current;
        }
        return raw;
    }
    level(resourceId) { return this.states.get(resourceId)?.level ?? 'clear'; }
}
const DERATE = Object.freeze({ clear: 1, elevated: 0.9, congested: 0.65, saturated: 0.3 });
/** Returns a derated copy for advisory ranking; never mutates the input. */
export const applyCongestionToResource = (resource, assessment) => {
    if (assessment.level === 'clear')
        return resource;
    const factor = DERATE[assessment.level];
    const score = Math.round(resource.health.score * factor);
    const status = assessment.level === 'saturated' ? 'failed' : assessment.level === 'congested' ? 'degraded' : resource.health.status;
    return Object.freeze({
        ...resource,
        health: Object.freeze({ ...resource.health, score, status }),
        metadata: Object.freeze({ ...resource.metadata, congestionLevel: assessment.level, congestionPressure: assessment.pressure }),
    });
};
//# sourceMappingURL=congestion.js.map