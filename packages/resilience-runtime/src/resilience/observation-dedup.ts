/**
 * Caching/deduplication and adaptive polling for issue #283.
 * Prevents duplicate network observations from amplifying into duplicate work.
 */

export interface DedupAdmission {
  readonly admitted: boolean;
  readonly duplicate: boolean;
}

export class ObservationDedupCache {
  private readonly seen = new Map<string, number>();
  private hitsTotal = 0;
  private admittedTotal = 0;

  constructor(
    private readonly ttlMs: number = 5_000,
    private readonly maxKeys: number = 5_000,
  ) {
    if (!Number.isInteger(ttlMs) || ttlMs < 1) throw new RangeError('ttlMs must be >= 1');
    if (!Number.isInteger(maxKeys) || maxKeys < 1) throw new RangeError('maxKeys must be >= 1');
  }

  admit(key: string, nowMs: number = Date.now()): DedupAdmission {
    const last = this.seen.get(key);
    if (last !== undefined && nowMs - last < this.ttlMs) {
      this.hitsTotal++;
      return { admitted: false, duplicate: true };
    }
    if (this.seen.size >= this.maxKeys && last === undefined) {
      const oldest = this.seen.keys().next();
      if (!oldest.done) this.seen.delete(oldest.value);
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

export interface AdaptivePollingConfig {
  readonly baseIntervalMs: number;
  readonly minIntervalMs: number;
  readonly maxIntervalMs: number;
  readonly backoffFactor: number;
  readonly recoveryFactor: number;
}

/**
 * Lengthens the poll interval while observations are stable, shortens it
 * while degradation is observed. Always stays within [min, max].
 */
export const nextPollInterval = (
  currentIntervalMs: number,
  degraded: boolean,
  config: AdaptivePollingConfig,
): number => {
  if (config.minIntervalMs > config.maxIntervalMs) {
    throw new RangeError('minIntervalMs must be <= maxIntervalMs');
  }
  const next = degraded
    ? currentIntervalMs / config.recoveryFactor
    : currentIntervalMs * config.backoffFactor;
  return Math.min(
    config.maxIntervalMs,
    Math.max(config.minIntervalMs, Math.round(next)),
  );
};
