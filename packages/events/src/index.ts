export type { DomainEvent } from '@irp/shared';

import type { DomainEvent } from '@irp/shared';

export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => Promise<void> | void;

/**
 * @internal
 * EventBus is an internal implementation detail. Do not use directly.
 * Production code must use the canonical runtime's event system via @irp/resilience-runtime.
 */
export interface EventBus {
  publish<T extends DomainEvent>(event: T): Promise<void>;
  subscribe<T extends DomainEvent>(type: T['type'], handler: EventHandler<T>): () => void;
}

/**
 * @internal
 * InMemoryEventBus is an internal implementation. Do not use directly.
 */
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();

  async publish<T extends DomainEvent>(event: T): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? new Set();
    await Promise.all([...handlers].map((handler) => handler(event)));
  }

  subscribe<T extends DomainEvent>(type: T['type'], handler: EventHandler<T>): () => void {
    const set = this.handlers.get(type) ?? new Set<EventHandler>();
    set.add(handler as EventHandler);
    this.handlers.set(type, set);
    return () => set.delete(handler as EventHandler);
  }
}
