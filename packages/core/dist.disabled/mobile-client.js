const isMobilePlatform = (value) => value === 'ios' || value === 'android';
export const createMobileClientState = (platform) => {
    if (!isMobilePlatform(platform)) {
        throw new Error(`Unsupported mobile platform: ${platform}`);
    }
    return {
        platform,
        connection: 'unknown',
        policy: { autonomousMode: false },
        revision: 0,
    };
};
export class MobileClientCore {
    state;
    listeners = new Set();
    constructor(platform) {
        this.state = createMobileClientState(platform);
    }
    getState() {
        return {
            ...this.state,
            policy: { ...this.state.policy },
        };
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    setAutonomousMode(enabled) {
        if (this.state.policy.autonomousMode === enabled)
            return;
        this.state = {
            ...this.state,
            policy: { autonomousMode: enabled },
            revision: this.state.revision + 1,
        };
        this.emit({ type: 'policy-changed', state: this.getState() });
    }
    async refresh(adapter) {
        const snapshot = await adapter.snapshot();
        if (!isMobilePlatform(snapshot.platform)) {
            throw new Error(`Unsupported diagnostics platform: ${snapshot.platform}`);
        }
        if (snapshot.platform !== this.state.platform) {
            throw new Error(`Diagnostics platform mismatch: expected ${this.state.platform}, received ${snapshot.platform}`);
        }
        const previousConnection = this.state.connection;
        this.state = {
            ...this.state,
            connection: snapshot.connection,
            revision: this.state.revision + 1,
        };
        this.emit({ type: 'snapshot', state: this.getState(), snapshot });
        if (previousConnection !== snapshot.connection) {
            this.emit({ type: 'connection-changed', state: this.getState() });
        }
        return snapshot;
    }
    emit(event) {
        for (const listener of this.listeners)
            listener(event);
    }
}
//# sourceMappingURL=mobile-client.js.map