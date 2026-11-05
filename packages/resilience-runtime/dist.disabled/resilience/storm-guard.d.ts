/**
 * Network-event storm guard for issue #283.
 * Bounds inbound event bursts so a flapping provider cannot exhaust the daemon.
 */
export interface StormGuardDecision {
    readonly admitted: boolean;
    readonly shed: boolean;
    readonly coolingDown: boolean;
}
export declare class NetworkEventStormGuard {
    private readonly maxEventsPerWindow;
    private readonly windowMs;
    private readonly cooldownMs;
    private windowStartMs;
    private windowCount;
    private cooldownUntilMs;
    private admittedTotal;
    private shedTotal;
    constructor(maxEventsPerWindow?: number, windowMs?: number, cooldownMs?: number);
    admit(nowMs?: number): StormGuardDecision;
    status(): Readonly<{
        admittedTotal: number;
        shedTotal: number;
        coolingDown: boolean;
    }>;
}
//# sourceMappingURL=storm-guard.d.ts.map