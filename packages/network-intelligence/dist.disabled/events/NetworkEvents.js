export class NetworkEventEmitter {
    handlers = new Map();
    subscribe(event, handler) {
        const set = this.handlers.get(event) ?? new Set();
        set.add(handler);
        this.handlers.set(event, set);
    }
    unsubscribe(event, handler) {
        this.handlers
            .get(event)
            ?.delete(handler);
    }
    async emit(event, payload) {
        await Promise.all([...(this.handlers.get(event) ?? [])].map((h) => h(payload)));
    }
}
//# sourceMappingURL=NetworkEvents.js.map