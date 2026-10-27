/**
 * Network-event storm guard for issue #283.
 * Bounds inbound event bursts so a flapping provider cannot exhaust the daemon.
 */

export interface StormGuardDecision {
  readonly admitted: boolean;
  readonly shed: boolean;
  readonly coolingDown: boolean;
}

export class NetworkEventStormGuard {
  private windowStartMs: number | undefined;
  private windowCount = 0;
  private cooldownUntilMs = 0;
  private admittedTotal = 0;
  private shedTotal = 0;

  constructor(
    private readonly maxEventsPerWindow: number = 500,
    private readonly windowMs: number = 1_000,
    private readonly cooldownMs: number = 5_000,
  ) {
    if (!Number.isInteger(maxEventsPerWindow) || maxEventsPerWindow < 1) {
      throw new RangeError('maxEventsPerWindow must be >= 1');
    }
  }

  admit(nowMs: number = Date.now()): StormGuardDecision {
    if (nowMs < this.cooldownUntilMs) {
      this.shedTotal++;
      return { admitted: false, shed: true, coolingDown: true };
    }
    if (this.windowStartMs === undefined || nowMs - this.windowStartMs >= this.windowMs) {
      this.windowStartMs = nowMs;
      this.windowCount = 0;
    }
    this.windowCount++;
    if (this.windowCount > this.maxEventsPerWindow) {
      this.cooldownUntilMs = nowMs + this.cooldownMs;
      this.shedTotal++;
      return { admitted: false, shed: true, coolingDown: true };
    }
    this.admittedTotal++;
    return { admitted: true, shed: false, coolingDown: false };
  }

  status() {
    return Object.freeze({
      admittedTotal: this.admittedTotal,
      shedTotal: this.shedTotal,
      coolingDown: Date.now() < this.cooldownUntilMs,
    });
  }
}
