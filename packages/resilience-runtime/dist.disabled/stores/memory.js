export class InMemoryDecisionStore {
    rows = new Map();
    async put(r) {
        this.rows.set(r.decisionId, Object.freeze(r));
    }
    async list() {
        return [...this.rows.values()];
    }
    async get(id) {
        return this.rows.get(id);
    }
}
export class InMemoryIncidentStore {
    rows = new Map();
    async put(i) {
        this.rows.set(i.id, Object.freeze(i));
    }
    async list() {
        return [...this.rows.values()];
    }
}
export class InMemoryRuntimeStateStore {
    state;
    constructor(state = 'idle') {
        this.state = state;
    }
    async get() {
        return this.state;
    }
    async set(s) {
        this.state = s;
    }
}
//# sourceMappingURL=memory.js.map