/**
 * Phase 136 — Event Channel & Integration Contracts.
 *
 * A typed, schema-validated publish/subscribe channel with at-least-once
 * delivery to bounded per-subscriber queues, duplicate suppression by event
 * id, retry with a delivery limit and a dead-letter store. Contracts declare
 * the payload schema and version of every event type; unknown or malformed
 * events are refused at publish time. Events carry facts, never authority.
 */

import { validateAgainstSchema, type ObjectSchema } from './versioned-api.js';

export interface EventContract { readonly type: string; readonly version: string; readonly schema: ObjectSchema }
export interface ChannelEvent { readonly id: string; readonly type: string; readonly version: string; readonly atMs: number; readonly payload: Readonly<Record<string, unknown>> }
export interface Delivery { readonly event: ChannelEvent; readonly attempt: number }
export interface Subscription { readonly id: string; readonly types: readonly string[]; readonly maxQueue: number; readonly maxAttempts: number }
export interface DeadLetter { readonly subscriptionId: string; readonly event: ChannelEvent; readonly reason: 'queue-full' | 'max-attempts'; readonly attempts: number }

export class ChannelError extends Error {
  constructor(readonly code: 'unknown-contract' | 'invalid-payload' | 'version-mismatch' | 'unknown-subscription', message: string) { super(message); this.name = 'ChannelError'; }
}

export class EventChannel {
  private readonly contracts = new Map<string, EventContract>();
  private readonly subs = new Map<string, { sub: Subscription; queue: Delivery[] }>();
  private readonly seen = new Set<string>();
  private readonly seenOrder: string[] = [];
  readonly deadLetters: DeadLetter[] = [];
  constructor(private readonly dedupeCapacity = 10_000, private readonly deadLetterCapacity = 1_000) {}

  declare(contract: EventContract): void {
    const prev = this.contracts.get(contract.type);
    if (prev && prev.version !== contract.version) throw new ChannelError('version-mismatch', `${contract.type} already declared at ${prev.version}`);
    this.contracts.set(contract.type, Object.freeze({ ...contract }));
  }

  subscribe(sub: Omit<Subscription, 'maxQueue' | 'maxAttempts'> & Partial<Pick<Subscription, 'maxQueue' | 'maxAttempts'>>): Subscription {
    for (const t of sub.types) if (!this.contracts.has(t)) throw new ChannelError('unknown-contract', `no contract for ${t}`);
    const full: Subscription = Object.freeze({ id: sub.id, types: Object.freeze([...sub.types]), maxQueue: sub.maxQueue ?? 1_000, maxAttempts: sub.maxAttempts ?? 5 });
    this.subs.set(full.id, { sub: full, queue: [] });
    return full;
  }

  unsubscribe(id: string): boolean { return this.subs.delete(id); }

  /** Publishes an event; returns the number of subscriptions it was queued for (0 for a duplicate id). */
  publish(event: ChannelEvent): number {
    const c = this.contracts.get(event.type);
    if (!c) throw new ChannelError('unknown-contract', `no contract for ${event.type}`);
    if (c.version !== event.version) throw new ChannelError('version-mismatch', `${event.type} expects version ${c.version}`);
    const checked = validateAgainstSchema(event.payload, c.schema);
    if (!checked.ok) throw new ChannelError('invalid-payload', checked.errors.join('; '));
    if (this.seen.has(event.id)) return 0;
    this.seen.add(event.id); this.seenOrder.push(event.id);
    while (this.seenOrder.length > this.dedupeCapacity) this.seen.delete(this.seenOrder.shift() as string);
    let queued = 0;
    const frozen: ChannelEvent = Object.freeze({ ...event, payload: Object.freeze({ ...checked.value }) });
    for (const s of [...this.subs.values()].sort((a, b) => a.sub.id.localeCompare(b.sub.id))) {
      if (!s.sub.types.includes(event.type)) continue;
      if (s.queue.length >= s.sub.maxQueue) { this.deadLetter(s.sub.id, frozen, 'queue-full', 0); continue; }
      s.queue.push({ event: frozen, attempt: 0 }); queued += 1;
    }
    return queued;
  }

  /** Takes up to `max` deliveries; each must be acknowledged with ack or nack. */
  poll(subscriptionId: string, max = 10): readonly Delivery[] {
    const s = this.subs.get(subscriptionId);
    if (!s) throw new ChannelError('unknown-subscription', subscriptionId);
    return Object.freeze(s.queue.splice(0, max).map((d) => Object.freeze({ event: d.event, attempt: d.attempt + 1 })));
  }

  /** A negative acknowledgement requeues the delivery until the attempt limit, then dead-letters it. */
  nack(subscriptionId: string, delivery: Delivery): 'requeued' | 'dead-lettered' {
    const s = this.subs.get(subscriptionId);
    if (!s) throw new ChannelError('unknown-subscription', subscriptionId);
    if (delivery.attempt >= s.sub.maxAttempts) { this.deadLetter(subscriptionId, delivery.event, 'max-attempts', delivery.attempt); return 'dead-lettered'; }
    s.queue.unshift({ event: delivery.event, attempt: delivery.attempt });
    return 'requeued';
  }

  pending(subscriptionId: string): number { return this.subs.get(subscriptionId)?.queue.length ?? 0; }

  private deadLetter(subscriptionId: string, event: ChannelEvent, reason: DeadLetter['reason'], attempts: number): void {
    this.deadLetters.push(Object.freeze({ subscriptionId, event, reason, attempts }));
    while (this.deadLetters.length > this.deadLetterCapacity) this.deadLetters.shift();
  }
}
