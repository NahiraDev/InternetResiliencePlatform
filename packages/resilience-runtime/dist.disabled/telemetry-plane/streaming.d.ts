/**
 * Phase 101 — Streaming Metrics & Events.
 *
 * A bounded fan-out channel for telemetry records with per-subscriber cursors,
 * explicit backpressure policy and loss accounting. It is a transport for
 * telemetry only: the canonical `EventSink` remains the evidence authority, and
 * a slow or failing subscriber can never block the producer or the control loop.
 */
import type { TelemetryRecord } from './unified-telemetry.js';
export type BackpressurePolicy = 'drop-oldest' | 'drop-newest' | 'reject';
export interface TelemetrySubscriptionOptions {
    readonly id: string;
    readonly capacity?: number;
    readonly policy?: BackpressurePolicy;
    readonly filter?: (record: TelemetryRecord) => boolean;
}
export interface SubscriptionStats {
    readonly id: string;
    readonly queued: number;
    readonly delivered: number;
    readonly dropped: number;
    readonly rejected: number;
    readonly lagging: boolean;
}
export declare class TelemetryBackpressureError extends Error {
    readonly subscriptionId: string;
    constructor(subscriptionId: string);
}
export declare class TelemetryChannel {
    private readonly subs;
    subscribe(options: TelemetrySubscriptionOptions): void;
    unsubscribe(id: string): boolean;
    /**
     * Publishes to every matching subscription. Returns the ids that rejected the record
     * (policy `reject`); the producer decides what to do and is never blocked or thrown at.
     */
    publish(record: TelemetryRecord): readonly string[];
    /** Drains up to `max` records for a subscriber in publication order. */
    poll(id: string, max?: number): readonly TelemetryRecord[];
    /** Delivers queued records to a consumer; a throwing consumer re-queues nothing and is counted as dropped. */
    flush(id: string, consumer: (batch: readonly TelemetryRecord[]) => void | Promise<void>, max?: number): Promise<number>;
    stats(): readonly SubscriptionStats[];
}
//# sourceMappingURL=streaming.d.ts.map