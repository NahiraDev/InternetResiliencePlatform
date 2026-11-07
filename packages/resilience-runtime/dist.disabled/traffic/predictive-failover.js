/**
 * Phase 99 — Predictive Failover & Recovery.
 *
 * Trend-based, advisory-only prediction. A degrading resource produces a
 * `FailoverAdvisory` naming a pre-armed standby chosen through the existing
 * fabric selection boundary; recovery readiness gates fail-back with dwell and
 * consecutive-healthy requirements. Nothing here executes a switch: advisories
 * flow to the closed-loop controller and obey autonomy/safety gates.
 */
import { SampleWindow, linearTrend, parseTime, clamp } from '../analytics/series.js';
export const DEFAULT_PREDICTIVE_FAILOVER_CONFIG = Object.freeze({
    windowSize: 24, minSamples: 5, failureThreshold: 30, horizonMs: 5 * 60_000, minRSquared: 0.5,
    recoveryHealthyScore: 80, recoveryConsecutive: 5, recoveryDwellMs: 2 * 60_000,
});
export class PredictiveFailoverAdvisor {
    fabric;
    config;
    windows = new Map();
    constructor(fabric, config = DEFAULT_PREDICTIVE_FAILOVER_CONFIG) {
        this.fabric = fabric;
        this.config = config;
    }
    observe(sample) {
        const at = parseTime(sample.at);
        if (!Number.isFinite(at))
            throw new Error('health sample timestamp is invalid');
        let w = this.windows.get(sample.resourceId);
        if (!w) {
            w = new SampleWindow(this.config.windowSize);
            this.windows.set(sample.resourceId, w);
        }
        w.push({ at, value: clamp(sample.score, 0, 100) });
    }
    advise(resourceId, standbyRequest, now) {
        const w = this.windows.get(resourceId);
        const samples = w?.values() ?? [];
        const base = { resourceId, evaluatedAt: now };
        if (samples.length < this.config.minSamples) {
            return Object.freeze({ ...base, urgency: 'none', confidence: 0, reasons: Object.freeze(['insufficient-samples']) });
        }
        const latest = samples[samples.length - 1];
        const trend = linearTrend(samples);
        if (!trend || trend.rSquared < this.config.minRSquared) {
            return Object.freeze({ ...base, urgency: 'none', currentScore: latest.value, confidence: trend?.rSquared ?? 0, reasons: Object.freeze(['trend-not-significant']) });
        }
        const slopePerMinute = trend.slopePerMs * 60_000;
        if (latest.value <= this.config.failureThreshold) {
            return this.withStandby({ ...base, urgency: 'imminent', currentScore: latest.value, slopePerMinute, predictedBreachInMs: 0, confidence: trend.rSquared, reasons: Object.freeze(['below-failure-threshold']) }, resourceId, standbyRequest, now);
        }
        if (trend.slopePerMs >= 0) {
            return Object.freeze({ ...base, urgency: 'none', currentScore: latest.value, slopePerMinute, confidence: trend.rSquared, reasons: Object.freeze(['non-degrading-trend']) });
        }
        const breachIn = (latest.value - this.config.failureThreshold) / -trend.slopePerMs;
        const urgency = breachIn <= this.config.horizonMs / 3 ? 'imminent' : breachIn <= this.config.horizonMs ? 'prepare' : breachIn <= this.config.horizonMs * 3 ? 'watch' : 'none';
        const advisory = { ...base, urgency, currentScore: latest.value, slopePerMinute, predictedBreachInMs: Math.round(breachIn), confidence: trend.rSquared, reasons: Object.freeze([`predicted-breach-in-${Math.round(breachIn / 1000)}s`]) };
        return urgency === 'prepare' || urgency === 'imminent' ? this.withStandby(advisory, resourceId, standbyRequest, now) : Object.freeze(advisory);
    }
    withStandby(advisory, resourceId, request, now) {
        const selection = this.fabric.select({ ...request, now });
        const standby = selection.candidates.find((c) => c.id !== resourceId);
        if (!standby) {
            return Object.freeze({ ...advisory, standbySelection: selection, reasons: Object.freeze([...advisory.reasons, 'no-standby-available']) });
        }
        return Object.freeze({ ...advisory, standby, standbySelection: selection });
    }
    recoveryReadiness(resourceId, now) {
        const samples = this.windows.get(resourceId)?.values() ?? [];
        let consecutive = 0;
        let firstHealthyAt;
        for (let i = samples.length - 1; i >= 0; i -= 1) {
            const s = samples[i];
            if (s.value < this.config.recoveryHealthyScore)
                break;
            consecutive += 1;
            firstHealthyAt = s.at;
        }
        const healthyForMs = firstHealthyAt === undefined ? 0 : Math.max(0, parseTime(now) - firstHealthyAt);
        const reasons = [];
        if (consecutive < this.config.recoveryConsecutive)
            reasons.push('insufficient-consecutive-healthy-samples');
        if (healthyForMs < this.config.recoveryDwellMs)
            reasons.push('recovery-dwell-not-elapsed');
        return Object.freeze({ resourceId, ready: reasons.length === 0, consecutiveHealthy: consecutive, healthyForMs, reasons: Object.freeze(reasons.length ? reasons : ['recovery-ready']) });
    }
}
//# sourceMappingURL=predictive-failover.js.map