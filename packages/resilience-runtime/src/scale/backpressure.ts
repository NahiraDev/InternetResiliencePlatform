/**
 * Phase 148 — Horizontal Scale & Backpressure Engineering.
 *
 * Primitives that keep the control plane stable under overload: a token
 * bucket, a bounded priority work queue that sheds the lowest priority first
 * (never control/safety work), an AIMD adaptive concurrency limiter, and a
 * circuit breaker. All time is injected; nothing blocks or spawns timers.
 */

export class TokenBucket {
  private tokens: number; private last: number;
  constructor(private readonly capacity: number, private readonly refillPerSec: number, nowMs: number) {
    if (!(capacity > 0) || !(refillPerSec > 0)) throw new Error('capacity and refill rate must be positive');
    this.tokens = capacity; this.last = nowMs;
  }
  tryTake(n: number, nowMs: number): boolean {
    this.tokens = Math.min(this.capacity, this.tokens + Math.max(0, nowMs - this.last) / 1000 * this.refillPerSec); this.last = Math.max(this.last, nowMs);
    if (this.tokens < n) return false;
    this.tokens -= n; return true;
  }
  /** Milliseconds until `n` tokens are available (0 if available now). */
  waitMs(n: number, nowMs: number): number {
    const t = Math.min(this.capacity, this.tokens + Math.max(0, nowMs - this.last) / 1000 * this.refillPerSec);
    return t >= n ? 0 : Math.ceil((n - t) / this.refillPerSec * 1000);
  }
}

export interface WorkItem<T> { readonly id: string; readonly priority: number; readonly payload: T; readonly protectedWork?: boolean }
export type EnqueueResult<T> = { readonly accepted: true; readonly shed?: WorkItem<T> } | { readonly accepted: false; readonly reason: 'queue-full' };

/** Lower priority number = more important. Protected items are never shed and always admitted up to a hard reserve. */
export class BoundedPriorityQueue<T> {
  private items: WorkItem<T>[] = []; private seq = 0; private readonly order = new Map<string, number>();
  constructor(private readonly capacity: number, private readonly protectedReserve = 0) { if (capacity < 1 || protectedReserve < 0 || protectedReserve >= capacity) throw new Error('invalid queue bounds'); }
  enqueue(item: WorkItem<T>): EnqueueResult<T> {
    const limit = item.protectedWork ? this.capacity + this.protectedReserve : this.capacity;
    if (this.items.length < limit) { this.push(item); return { accepted: true }; }
    // Full: shed the least important unprotected item if the newcomer outranks it.
    const victim = [...this.items].filter((i) => !i.protectedWork).sort((a, b) => b.priority - a.priority || (this.order.get(b.id) as number) - (this.order.get(a.id) as number))[0];
    if (victim && (item.protectedWork || item.priority < victim.priority)) {
      this.items = this.items.filter((i) => i !== victim); this.order.delete(victim.id); this.push(item);
      return { accepted: true, shed: victim };
    }
    return { accepted: false, reason: 'queue-full' };
  }
  private push(item: WorkItem<T>) { this.order.set(item.id, this.seq++); this.items.push(item); }
  dequeue(): WorkItem<T> | undefined {
    if (!this.items.length) return undefined;
    const best = [...this.items].sort((a, b) => (a.protectedWork === b.protectedWork ? 0 : a.protectedWork ? -1 : 1) || a.priority - b.priority || (this.order.get(a.id) as number) - (this.order.get(b.id) as number))[0] as WorkItem<T>;
    this.items = this.items.filter((i) => i !== best); this.order.delete(best.id);
    return best;
  }
  get size(): number { return this.items.length; }
}

/** AIMD: additive increase on success under the latency target, multiplicative decrease on overload. */
export class AdaptiveConcurrencyLimiter {
  private limitValue: number; private inFlight = 0;
  constructor(private readonly min: number, private readonly max: number, private readonly targetLatencyMs: number, initial = min, private readonly backoff = 0.5) {
    if (min < 1 || max < min || backoff <= 0 || backoff >= 1) throw new Error('invalid limiter bounds');
    this.limitValue = Math.min(max, Math.max(min, initial));
  }
  tryAcquire(): boolean { if (this.inFlight >= Math.floor(this.limitValue)) return false; this.inFlight += 1; return true; }
  release(latencyMs: number, failed: boolean): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    if (failed || latencyMs > this.targetLatencyMs * 2) this.limitValue = Math.max(this.min, this.limitValue * this.backoff);
    else if (latencyMs <= this.targetLatencyMs) this.limitValue = Math.min(this.max, this.limitValue + 1 / this.limitValue);
  }
  get limit(): number { return Math.floor(this.limitValue); }
  get active(): number { return this.inFlight; }
}

export type BreakerState = 'closed' | 'open' | 'half-open';
export class CircuitBreaker {
  private state: BreakerState = 'closed'; private failures = 0; private openedAt = 0; private probes = 0;
  constructor(private readonly failureThreshold: number, private readonly cooldownMs: number, private readonly halfOpenProbes = 1) { if (failureThreshold < 1 || cooldownMs <= 0 || halfOpenProbes < 1) throw new Error('invalid breaker config'); }
  allow(nowMs: number): boolean {
    if (this.state === 'open') { if (nowMs - this.openedAt < this.cooldownMs) return false; this.state = 'half-open'; this.probes = 0; }
    if (this.state === 'half-open') { if (this.probes >= this.halfOpenProbes) return false; this.probes += 1; }
    return true;
  }
  success(): void { this.failures = 0; this.state = 'closed'; }
  failure(nowMs: number): void {
    if (this.state === 'half-open') { this.state = 'open'; this.openedAt = nowMs; return; }
    this.failures += 1;
    if (this.failures >= this.failureThreshold) { this.state = 'open'; this.openedAt = nowMs; }
  }
  get current(): BreakerState { return this.state; }
}

/** Consistent hashing with virtual nodes for stable shard ownership as workers join and leave. */
export class ConsistentHashRing {
  private ring: { point: number; node: string }[] = [];
  constructor(private readonly vnodes = 64) { if (vnodes < 1) throw new Error('vnodes must be positive'); }
  private static hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 13; return h >>> 0; }
  add(node: string): void { if (this.ring.some((r) => r.node === node)) return; for (let i = 0; i < this.vnodes; i += 1) this.ring.push({ point: ConsistentHashRing.hash(`${node}#${i}`), node }); this.ring.sort((a, b) => a.point - b.point || a.node.localeCompare(b.node)); }
  remove(node: string): void { this.ring = this.ring.filter((r) => r.node !== node); }
  owner(key: string): string | undefined {
    if (!this.ring.length) return undefined;
    const h = ConsistentHashRing.hash(key);
    return (this.ring.find((r) => r.point >= h) ?? (this.ring[0] as { node: string })).node;
  }
}
