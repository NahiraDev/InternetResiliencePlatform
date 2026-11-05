/**
 * Phase 101 — Streaming Metrics & Events.
 *
 * A bounded fan-out channel for telemetry records with per-subscriber cursors,
 * explicit backpressure policy and loss accounting. It is a transport for
 * telemetry only: the canonical `EventSink` remains the evidence authority, and
 * a slow or failing subscriber can never block the producer or the control loop.
 */
export class TelemetryBackpressureError extends Error {
    subscriptionId;
    constructor(subscriptionId) {
        super(`telemetry subscription ${subscriptionId} is full and its policy is reject`);
        this.subscriptionId = subscriptionId;
        this.name = 'TelemetryBackpressureError';
    }
}
class Subscription {
    options;
    queue = [];
    delivered = 0;
    dropped = 0;
    rejected = 0;
    capacity;
    policy;
    constructor(options) {
        this.options = options;
        this.capacity = options.capacity ?? 1_000;
        this.policy = options.policy ?? 'drop-oldest';
        if (!Number.isInteger(this.capacity) || this.capacity < 1)
            throw new Error('subscription capacity must be a positive integer');
    }
}
export class TelemetryChannel {
    subs = new Map();
    subscribe(options) {
        if (!options.id.trim())
            throw new Error('subscription id is required');
        if (this.subs.has(options.id))
            throw new Error(`telemetry subscription already exists: ${options.id}`);
        this.subs.set(options.id, new Subscription(options));
    }
    unsubscribe(id) { return this.subs.delete(id); }
    /**
     * Publishes to every matching subscription. Returns the ids that rejected the record
     * (policy `reject`); the producer decides what to do and is never blocked or thrown at.
     */
    publish(record) {
        const rejectedBy = [];
        for (const sub of [...this.subs.values()].sort((a, b) => a.options.id.localeCompare(b.options.id))) {
            if (sub.options.filter) {
                try {
                    if (!sub.options.filter(record))
                        continue;
                }
                catch {
                    continue;
                }
            }
            if (sub.queue.length >= sub.capacity) {
                if (sub.policy === 'reject') {
                    sub.rejected += 1;
                    rejectedBy.push(sub.options.id);
                    continue;
                }
                if (sub.policy === 'drop-newest') {
                    sub.dropped += 1;
                    continue;
                }
                sub.queue.shift();
                sub.dropped += 1;
            }
            sub.queue.push(record);
        }
        return Object.freeze(rejectedBy);
    }
    /** Drains up to `max` records for a subscriber in publication order. */
    poll(id, max = 100) {
        const sub = this.subs.get(id);
        if (!sub)
            throw new Error(`unknown telemetry subscription: ${id}`);
        const batch = sub.queue.splice(0, Math.max(0, max));
        sub.delivered += batch.length;
        return Object.freeze(batch);
    }
    /** Delivers queued records to a consumer; a throwing consumer re-queues nothing and is counted as dropped. */
    async flush(id, consumer, max = 100) {
        const batch = this.poll(id, max);
        if (batch.length === 0)
            return 0;
        try {
            await consumer(batch);
        }
        catch {
            const sub = this.subs.get(id);
            if (sub) {
                sub.dropped += batch.length;
                sub.delivered -= batch.length;
            }
            return 0;
        }
        return batch.length;
    }
    stats() {
        return Object.freeze([...this.subs.values()].sort((a, b) => a.options.id.localeCompare(b.options.id)).map((s) => Object.freeze({
            id: s.options.id, queued: s.queue.length, delivered: s.delivered, dropped: s.dropped, rejected: s.rejected,
            lagging: s.queue.length >= s.capacity * 0.8,
        })));
    }
}
//# sourceMappingURL=streaming.js.map