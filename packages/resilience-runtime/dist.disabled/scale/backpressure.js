/**
 * Phase 148 — Horizontal Scale & Backpressure Engineering.
 *
 * Primitives that keep the control plane stable under overload: a token
 * bucket, a bounded priority work queue that sheds the lowest priority first
 * (never control/safety work), an AIMD adaptive concurrency limiter, and a
 * circuit breaker. All time is injected; nothing blocks or spawns timers.
 */
export class TokenBucket {
    capacity;
    refillPerSec;
    tokens;
    last;
    constructor(capacity, refillPerSec, nowMs) {
        this.capacity = capacity;
        this.refillPerSec = refillPerSec;
        if (!(capacity > 0) || !(refillPerSec > 0))
            throw new Error('capacity and refill rate must be positive');
        this.tokens = capacity;
        this.last = nowMs;
    }
    tryTake(n, nowMs) {
        this.tokens = Math.min(this.capacity, this.tokens + Math.max(0, nowMs - this.last) / 1000 * this.refillPerSec);
        this.last = Math.max(this.last, nowMs);
        if (this.tokens < n)
            return false;
        this.tokens -= n;
        return true;
    }
    /** Milliseconds until `n` tokens are available (0 if available now). */
    waitMs(n, nowMs) {
        const t = Math.min(this.capacity, this.tokens + Math.max(0, nowMs - this.last) / 1000 * this.refillPerSec);
        return t >= n ? 0 : Math.ceil((n - t) / this.refillPerSec * 1000);
    }
}
/** Lower priority number = more important. Protected items are never shed and always admitted up to a hard reserve. */
export class BoundedPriorityQueue {
    capacity;
    protectedReserve;
    items = [];
    seq = 0;
    order = new Map();
    constructor(capacity, protectedReserve = 0) {
        this.capacity = capacity;
        this.protectedReserve = protectedReserve;
        if (capacity < 1 || protectedReserve < 0 || protectedReserve >= capacity)
            throw new Error('invalid queue bounds');
    }
    enqueue(item) {
        const limit = item.protectedWork ? this.capacity + this.protectedReserve : this.capacity;
        if (this.items.length < limit) {
            this.push(item);
            return { accepted: true };
        }
        // Full: shed the least important unprotected item if the newcomer outranks it.
        const victim = [...this.items].filter((i) => !i.protectedWork).sort((a, b) => b.priority - a.priority || this.order.get(b.id) - this.order.get(a.id))[0];
        if (victim && (item.protectedWork || item.priority < victim.priority)) {
            this.items = this.items.filter((i) => i !== victim);
            this.order.delete(victim.id);
            this.push(item);
            return { accepted: true, shed: victim };
        }
        return { accepted: false, reason: 'queue-full' };
    }
    push(item) { this.order.set(item.id, this.seq++); this.items.push(item); }
    dequeue() {
        if (!this.items.length)
            return undefined;
        const best = [...this.items].sort((a, b) => (a.protectedWork === b.protectedWork ? 0 : a.protectedWork ? -1 : 1) || a.priority - b.priority || this.order.get(a.id) - this.order.get(b.id))[0];
        this.items = this.items.filter((i) => i !== best);
        this.order.delete(best.id);
        return best;
    }
    get size() { return this.items.length; }
}
/** AIMD: additive increase on success under the latency target, multiplicative decrease on overload. */
export class AdaptiveConcurrencyLimiter {
    min;
    max;
    targetLatencyMs;
    backoff;
    limitValue;
    inFlight = 0;
    constructor(min, max, targetLatencyMs, initial = min, backoff = 0.5) {
        this.min = min;
        this.max = max;
        this.targetLatencyMs = targetLatencyMs;
        this.backoff = backoff;
        if (min < 1 || max < min || backoff <= 0 || backoff >= 1)
            throw new Error('invalid limiter bounds');
        this.limitValue = Math.min(max, Math.max(min, initial));
    }
    tryAcquire() { if (this.inFlight >= Math.floor(this.limitValue))
        return false; this.inFlight += 1; return true; }
    release(latencyMs, failed) {
        this.inFlight = Math.max(0, this.inFlight - 1);
        if (failed || latencyMs > this.targetLatencyMs * 2)
            this.limitValue = Math.max(this.min, this.limitValue * this.backoff);
        else if (latencyMs <= this.targetLatencyMs)
            this.limitValue = Math.min(this.max, this.limitValue + 1 / this.limitValue);
    }
    get limit() { return Math.floor(this.limitValue); }
    get active() { return this.inFlight; }
}
export class CircuitBreaker {
    failureThreshold;
    cooldownMs;
    halfOpenProbes;
    state = 'closed';
    failures = 0;
    openedAt = 0;
    probes = 0;
    constructor(failureThreshold, cooldownMs, halfOpenProbes = 1) {
        this.failureThreshold = failureThreshold;
        this.cooldownMs = cooldownMs;
        this.halfOpenProbes = halfOpenProbes;
        if (failureThreshold < 1 || cooldownMs <= 0 || halfOpenProbes < 1)
            throw new Error('invalid breaker config');
    }
    allow(nowMs) {
        if (this.state === 'open') {
            if (nowMs - this.openedAt < this.cooldownMs)
                return false;
            this.state = 'half-open';
            this.probes = 0;
        }
        if (this.state === 'half-open') {
            if (this.probes >= this.halfOpenProbes)
                return false;
            this.probes += 1;
        }
        return true;
    }
    success() { this.failures = 0; this.state = 'closed'; }
    failure(nowMs) {
        if (this.state === 'half-open') {
            this.state = 'open';
            this.openedAt = nowMs;
            return;
        }
        this.failures += 1;
        if (this.failures >= this.failureThreshold) {
            this.state = 'open';
            this.openedAt = nowMs;
        }
    }
    get current() { return this.state; }
}
/** Consistent hashing with virtual nodes for stable shard ownership as workers join and leave. */
export class ConsistentHashRing {
    vnodes;
    ring = [];
    constructor(vnodes = 64) {
        this.vnodes = vnodes;
        if (vnodes < 1)
            throw new Error('vnodes must be positive');
    }
    static hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    } h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 13; return h >>> 0; }
    add(node) { if (this.ring.some((r) => r.node === node))
        return; for (let i = 0; i < this.vnodes; i += 1)
        this.ring.push({ point: ConsistentHashRing.hash(`${node}#${i}`), node }); this.ring.sort((a, b) => a.point - b.point || a.node.localeCompare(b.node)); }
    remove(node) { this.ring = this.ring.filter((r) => r.node !== node); }
    owner(key) {
        if (!this.ring.length)
            return undefined;
        const h = ConsistentHashRing.hash(key);
        return (this.ring.find((r) => r.point >= h) ?? this.ring[0]).node;
    }
}
//# sourceMappingURL=backpressure.js.map