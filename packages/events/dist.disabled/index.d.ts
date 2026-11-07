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
export declare class InMemoryEventBus implements EventBus {
    private readonly handlers;
    publish<T extends DomainEvent>(event: T): Promise<void>;
    subscribe<T extends DomainEvent>(type: T['type'], handler: EventHandler<T>): () => void;
}
//# sourceMappingURL=index.d.ts.map