/**
 * Decaying failure memory and strategy quarantine for issue #276 (task 8).
 *
 * Failure memory records which strategies failed for which destination and
 * how recently. Confidence decays exponentially with a configurable half-life so
 * an old failure does not suppress a strategy forever.
 *
 * Quarantine is advisory ranking input only. A quarantined strategy is heavily
 * penalised in ranking, never forbidden by this module: policy remains the only
 * authority that may deny an action.
 */
import { nowIso } from '../domain/ids.js';
const DEFAULT_HALF_LIFE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const clamp01 = (value) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
/**
 * In-memory, decaying failure memory keyed by strategy and destination scope.
 */
export class DecayingFailureMemory {
    events = new Map();
    halfLifeMs;
    quarantinePenalty;
    quarantineThreshold;
    retentionMs;
    constructor(options = {}) {
        this.halfLifeMs = Math.max(1, options.halfLifeMs ?? DEFAULT_HALF_LIFE_MS);
        this.quarantinePenalty = Math.max(0, Math.min(1, options.quarantinePenalty ?? 0.6));
        this.quarantineThreshold = Math.max(0, options.quarantineThreshold ?? 0.75);
        this.retentionMs = Math.max(this.halfLifeMs, options.retentionMs ?? DEFAULT_RETENTION_MS);
    }
    recordFailure(event) {
        const key = this.key(event);
        const existing = this.events.get(key) ?? [];
        existing.push({ severity: 1, observedAt: nowIso(), ...event });
        this.events.set(key, existing);
    }
    key(event) {
        return [event.strategyId, event.destination ?? '*', event.providerId ?? '*'].join('|');
    }
    /** Decayed weight of a strategy's failures, per severity, at `nowMs`. */
    weightFor(events, nowMs) {
        let weight = 0;
        for (const event of events) {
            const observedMs = Date.parse(event.observedAt ?? nowIso());
            if (!Number.isFinite(observedMs))
                continue;
            const ageMs = nowMs - observedMs;
            if (ageMs < 0)
                continue;
            if (ageMs > this.retentionMs)
                continue;
            weight += clamp01(event.severity ?? 1) * Math.pow(0.5, ageMs / this.halfLifeMs);
        }
        return weight;
    }
    /** Quarantine state for one strategy, optionally within a destination scope. */
    quarantineFor(strategyId, scope = {}, nowMs = Date.now()) {
        // Exact scope match first, then the wildcard bucket, so a destination-scoped
        // failure does not penalise the same strategy for every destination. When
        // no scope is supplied both keys are identical, so count the bucket once.
        const wildcard = this.events.get(this.key({ strategyId }));
        const scoped = this.events.get(this.key({ strategyId, ...scope }));
        const combined = wildcard === undefined
            ? (scoped ?? [])
            : scoped === undefined || scoped === wildcard
                ? [...wildcard]
                : [...wildcard, ...scoped];
        const lastFailureAt = combined.reduce((latest, event) => ((event.observedAt ?? '') > latest ? (event.observedAt ?? '') : latest), combined[0]?.observedAt ?? nowIso());
        const weight = this.weightFor(combined, nowMs);
        return Object.freeze({
            strategyId,
            decayedFailureWeight: weight,
            failureCount: combined.length,
            lastFailureAt,
            quarantined: weight >= this.quarantineThreshold,
        });
    }
    /** Score multiplier for a strategy; 1 means unaffected, <1 penalised. */
    scoreMultiplier(strategyId, scope = {}, nowMs = Date.now()) {
        const { decayedFailureWeight, quarantined } = this.quarantineFor(strategyId, scope, nowMs);
        if (quarantined)
            return this.quarantinePenalty;
        if (decayedFailureWeight <= 0)
            return 1;
        // Graduated penalty below the quarantine threshold.
        const ratio = Math.min(1, decayedFailureWeight / this.quarantineThreshold);
        return 1 - ratio * this.quarantinePenalty;
    }
    /** Strategies currently quarantined, for explainability. */
    quarantined(scope = {}, nowMs = Date.now()) {
        const ids = new Set();
        for (const key of this.events.keys()) {
            const [strategyId, destination, providerId] = key.split('|');
            if (!strategyId)
                continue;
            if (scope.destination !== undefined &&
                destination !== '*' &&
                destination !== scope.destination) {
                continue;
            }
            if (scope.providerId !== undefined && providerId !== '*' && providerId !== scope.providerId) {
                continue;
            }
            ids.add(strategyId);
        }
        return Object.freeze([...ids]
            .map((strategyId) => this.quarantineFor(strategyId, scope, nowMs))
            .filter((entry) => entry.quarantined)
            .sort((a, b) => b.decayedFailureWeight - a.decayedFailureWeight ||
            a.strategyId.localeCompare(b.strategyId)));
    }
    /** Removes failures that have decayed past retention. */
    prune(nowMs = Date.now()) {
        let removed = 0;
        for (const [key, events] of this.events) {
            const kept = events.filter((event) => {
                const observedMs = Date.parse(event.observedAt ?? nowIso());
                return Number.isFinite(observedMs) && nowMs - observedMs <= this.retentionMs;
            });
            if (kept.length === 0) {
                this.events.delete(key);
            }
            else if (kept.length !== events.length) {
                this.events.set(key, kept);
            }
            removed += events.length - kept.length;
        }
        return removed;
    }
    clear() {
        this.events.clear();
    }
    snapshot(nowMs = Date.now()) {
        const ids = [...this.events.keys()].map((key) => key.split('|')[0] ?? key);
        return Object.freeze({
            strategies: Object.freeze([...new Set(ids)].sort().map((strategyId) => this.quarantineFor(strategyId, {}, nowMs))),
            now: new Date(nowMs).toISOString(),
        });
    }
}
//# sourceMappingURL=failure-memory.js.map