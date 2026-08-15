import { describe, expect, it } from 'vitest';
import { InMemoryEventBus } from './index.js';
import type { DomainEvent } from '@irp/shared';

const event = (type: string, id = 'evt-1'): DomainEvent => ({
  id,
  type,
  aggregateId: 'agg-1',
  occurredAt: new Date('2026-08-15T00:00:00.000Z'),
  payload: { ok: true },
});

describe('InMemoryEventBus', () => {
  it('publishes only to subscribers of the matching in-process event type', async () => {
    const bus = new InMemoryEventBus();
    const seen: string[] = [];
    bus.subscribe('network.changed', (published) => seen.push(published.type));
    bus.subscribe('dns.changed', (published) => seen.push(`wrong:${published.type}`));

    await bus.publish(event('network.changed'));

    expect(seen).toEqual(['network.changed']);
  });

  it('unsubscribes handlers and isolates later publishes from cleaned-up listeners', async () => {
    const bus = new InMemoryEventBus();
    const seen: string[] = [];
    const unsubscribe = bus.subscribe('network.changed', (published) => seen.push(published.id));

    await bus.publish(event('network.changed', 'first'));
    unsubscribe();
    await bus.publish(event('network.changed', 'second'));

    expect(seen).toEqual(['first']);
  });

  it('awaits concurrent async subscribers before publish resolves', async () => {
    const bus = new InMemoryEventBus();
    const seen: string[] = [];
    bus.subscribe('network.changed', async () => {
      await Promise.resolve();
      seen.push('async');
    });
    bus.subscribe('network.changed', () => seen.push('sync'));

    await bus.publish(event('network.changed'));

    expect(seen.sort()).toEqual(['async', 'sync']);
  });
});
