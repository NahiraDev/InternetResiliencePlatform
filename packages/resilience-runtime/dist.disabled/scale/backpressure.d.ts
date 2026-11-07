/**
 * Phase 148 — Horizontal Scale & Backpressure Engineering.
 *
 * Primitives that keep the control plane stable under overload: a token
 * bucket, a bounded priority work queue that sheds the lowest priority first
 * (never control/safety work), an AIMD adaptive concurrency limiter, and a
 * circuit breaker. All time is injected; nothing blocks or spawns timers.
 */
export declare class TokenBucket {
    private readonly capacity;
    private readonly refillPerSec;
    private tokens;
    private last;
    constructor(capacity: number, refillPerSec: number, nowMs: number);
    tryTake(n: number, nowMs: number): boolean;
    /** Milliseconds until `n` tokens are available (0 if available now). */
    waitMs(n: number, nowMs: number): number;
}
export interface WorkItem<T> {
    readonly id: string;
    readonly priority: number;
    readonly payload: T;
    readonly protectedWork?: boolean;
}
export type EnqueueResult<T> = {
    readonly accepted: true;
    readonly shed?: WorkItem<T>;
} | {
    readonly accepted: false;
    readonly reason: 'queue-full';
};
/** Lower priority number = more important. Protected items are never shed and always admitted up to a hard reserve. */
export declare class BoundedPriorityQueue<T> {
    private readonly capacity;
    private readonly protectedReserve;
    private items;
    private seq;
    private readonly order;
    constructor(capacity: number, protectedReserve?: number);
    enqueue(item: WorkItem<T>): EnqueueResult<T>;
    private push;
    dequeue(): WorkItem<T> | undefined;
    get size(): number;
}
/** AIMD: additive increase on success under the latency target, multiplicative decrease on overload. */
export declare class AdaptiveConcurrencyLimiter {
    private readonly min;
    private readonly max;
    private readonly targetLatencyMs;
    private readonly backoff;
    private limitValue;
    private inFlight;
    constructor(min: number, max: number, targetLatencyMs: number, initial?: number, backoff?: number);
    tryAcquire(): boolean;
    release(latencyMs: number, failed: boolean): void;
    get limit(): number;
    get active(): number;
}
export type BreakerState = 'closed' | 'open' | 'half-open';
export declare class CircuitBreaker {
    private readonly failureThreshold;
    private readonly cooldownMs;
    private readonly halfOpenProbes;
    private state;
    private failures;
    private openedAt;
    private probes;
    constructor(failureThreshold: number, cooldownMs: number, halfOpenProbes?: number);
    allow(nowMs: number): boolean;
    success(): void;
    failure(nowMs: number): void;
    get current(): BreakerState;
}
/** Consistent hashing with virtual nodes for stable shard ownership as workers join and leave. */
export declare class ConsistentHashRing {
    private readonly vnodes;
    private ring;
    constructor(vnodes?: number);
    private static hash;
    add(node: string): void;
    remove(node: string): void;
    owner(key: string): string | undefined;
}
//# sourceMappingURL=backpressure.d.ts.map