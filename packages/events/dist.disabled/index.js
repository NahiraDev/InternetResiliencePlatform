/**
 * @internal
 * InMemoryEventBus is an internal implementation. Do not use directly.
 */
export class InMemoryEventBus {
    handlers = new Map();
    async publish(event) {
        const handlers = this.handlers.get(event.type) ?? new Set();
        await Promise.all([...handlers].map((handler) => handler(event)));
    }
    subscribe(type, handler) {
        const set = this.handlers.get(type) ?? new Set();
        set.add(handler);
        this.handlers.set(type, set);
        return () => set.delete(handler);
    }
}
//# sourceMappingURL=index.js.map