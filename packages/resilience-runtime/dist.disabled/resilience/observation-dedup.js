/**
 * Caching/deduplication and adaptive polling for issue #283.
 * Prevents duplicate network observations from amplifying into duplicate work.
 */
export class ObservationDedupCache {
    ttlMs;
    maxKeys;
    seen = new Map();
    hitsTotal = 0;
    admittedTotal = 0;
    constructor(ttlMs = 5_000, maxKeys = 5_000) {
        this.ttlMs = ttlMs;
        this.maxKeys = maxKeys;
        if (!Number.isInteger(ttlMs) || ttlMs < 1)
            throw new RangeError('ttlMs must be >= 1');
        if (!Number.isInteger(maxKeys) || maxKeys < 1)
            throw new RangeError('maxKeys must be >= 1');
    }
    admit(key, nowMs = Date.now()) {
        const last = this.seen.get(key);
        if (last !== undefined && nowMs - last < this.ttlMs) {
            this.hitsTotal++;
            return { admitted: false, duplicate: true };
        }
        if (this.seen.size >= this.maxKeys && last === undefined) {
            const oldest = this.seen.keys().next();
            if (!oldest.done)
                this.seen.delete(oldest.value);
        }
        this.seen.set(key, nowMs);
        this.admittedTotal++;
        return { admitted: true, duplicate: false };
    }
    status() {
        return Object.freeze({
            keys: this.seen.size,
            admittedTotal: this.admittedTotal,
            duplicateHitsTotal: this.hitsTotal,
        });
    }
}
/**
 * Lengthens the poll interval while observations are stable, shortens it
 * while degradation is observed. Always stays within [min, max].
 */
export const nextPollInterval = (currentIntervalMs, degraded, config) => {
    if (config.minIntervalMs > config.maxIntervalMs) {
        throw new RangeError('minIntervalMs must be <= maxIntervalMs');
    }
    const next = degraded
        ? currentIntervalMs / config.recoveryFactor
        : currentIntervalMs * config.backoffFactor;
    return Math.min(config.maxIntervalMs, Math.max(config.minIntervalMs, Math.round(next)));
};
//# sourceMappingURL=observation-dedup.js.map