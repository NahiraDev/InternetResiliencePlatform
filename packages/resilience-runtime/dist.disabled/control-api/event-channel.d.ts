/**
 * Phase 136 — Event Channel & Integration Contracts.
 *
 * A typed, schema-validated publish/subscribe channel with at-least-once
 * delivery to bounded per-subscriber queues, duplicate suppression by event
 * id, retry with a delivery limit and a dead-letter store. Contracts declare
 * the payload schema and version of every event type; unknown or malformed
 * events are refused at publish time. Events carry facts, never authority.
 */
import { type ObjectSchema } from './versioned-api.js';
export interface EventContract {
    readonly type: string;
    readonly version: string;
    readonly schema: ObjectSchema;
}
export interface ChannelEvent {
    readonly id: string;
    readonly type: string;
    readonly version: string;
    readonly atMs: number;
    readonly payload: Readonly<Record<string, unknown>>;
}
export interface Delivery {
    readonly event: ChannelEvent;
    readonly attempt: number;
}
export interface Subscription {
    readonly id: string;
    readonly types: readonly string[];
    readonly maxQueue: number;
    readonly maxAttempts: number;
}
export interface DeadLetter {
    readonly subscriptionId: string;
    readonly event: ChannelEvent;
    readonly reason: 'queue-full' | 'max-attempts';
    readonly attempts: number;
}
export declare class ChannelError extends Error {
    readonly code: 'unknown-contract' | 'invalid-payload' | 'version-mismatch' | 'unknown-subscription';
    constructor(code: 'unknown-contract' | 'invalid-payload' | 'version-mismatch' | 'unknown-subscription', message: string);
}
export declare class EventChannel {
    private readonly dedupeCapacity;
    private readonly deadLetterCapacity;
    private readonly contracts;
    private readonly subs;
    private readonly seen;
    private readonly seenOrder;
    readonly deadLetters: DeadLetter[];
    constructor(dedupeCapacity?: number, deadLetterCapacity?: number);
    declare(contract: EventContract): void;
    subscribe(sub: Omit<Subscription, 'maxQueue' | 'maxAttempts'> & Partial<Pick<Subscription, 'maxQueue' | 'maxAttempts'>>): Subscription;
    unsubscribe(id: string): boolean;
    /** Publishes an event; returns the number of subscriptions it was queued for (0 for a duplicate id). */
    publish(event: ChannelEvent): number;
    /** Takes up to `max` deliveries; each must be acknowledged with ack or nack. */
    poll(subscriptionId: string, max?: number): readonly Delivery[];
    /** A negative acknowledgement requeues the delivery until the attempt limit, then dead-letters it. */
    nack(subscriptionId: string, delivery: Delivery): 'requeued' | 'dead-lettered';
    pending(subscriptionId: string): number;
    private deadLetter;
}
//# sourceMappingURL=event-channel.d.ts.map