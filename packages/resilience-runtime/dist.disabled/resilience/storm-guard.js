/**
 * Network-event storm guard for issue #283.
 * Bounds inbound event bursts so a flapping provider cannot exhaust the daemon.
 */
export class NetworkEventStormGuard {
    maxEventsPerWindow;
    windowMs;
    cooldownMs;
    windowStartMs;
    windowCount = 0;
    cooldownUntilMs = 0;
    admittedTotal = 0;
    shedTotal = 0;
    constructor(maxEventsPerWindow = 500, windowMs = 1_000, cooldownMs = 5_000) {
        this.maxEventsPerWindow = maxEventsPerWindow;
        this.windowMs = windowMs;
        this.cooldownMs = cooldownMs;
        if (!Number.isInteger(maxEventsPerWindow) || maxEventsPerWindow < 1) {
            throw new RangeError('maxEventsPerWindow must be >= 1');
        }
    }
    admit(nowMs = Date.now()) {
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
//# sourceMappingURL=storm-guard.js.map