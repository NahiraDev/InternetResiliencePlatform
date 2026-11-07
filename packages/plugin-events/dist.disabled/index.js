export class PluginEventBus {
    handlers = new Map();
    async publish(type, payload, priority = 0) {
        const event = {
            type,
            payload,
            priority,
            timestamp: new Date().toISOString(),
            source: 'plugin-runtime',
        };
        const handlers = [...(this.handlers.get(type) ?? []), ...(this.handlers.get('*') ?? [])].sort(() => -priority);
        await Promise.all(handlers.map((h) => h(event)));
    }
    subscribe(type, handler) {
        const set = this.handlers.get(type) ?? new Set();
        set.add(handler);
        this.handlers.set(type, set);
        return () => set.delete(handler);
    }
    async request(type, payload, timeoutMs = 5000) {
        let timer;
        let unsubscribe;
        try {
            const response = new Promise((resolve, reject) => {
                unsubscribe = this.subscribe(`${type}:response`, (event) => resolve(event.payload));
                timer = setTimeout(() => reject(new Error(`Plugin request ${type} timed out after ${timeoutMs}ms`)), timeoutMs);
            });
            await this.publish(`${type}:request`, payload);
            return await response;
        }
        finally {
            if (timer)
                clearTimeout(timer);
            unsubscribe?.();
        }
    }
    async broadcast(type, payload) {
        await this.publish(type, payload, 100);
    }
}
//# sourceMappingURL=index.js.map