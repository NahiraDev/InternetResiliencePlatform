const EMPTY_STATE = Object.freeze({
    id: 'network-state:initial',
    schemaVersion: 1,
    createdAt: new Date(0).toISOString(),
    source: 'resilience-runtime',
    metadata: Object.freeze({}),
    stateVersion: 0,
    desired: Object.freeze([]),
    observed: Object.freeze([]),
    actual: Object.freeze([]),
    reconciliation: 'unknown',
});
const freezeResources = (resources) => Object.freeze(resources.map((resource) => Object.freeze({
    ...resource,
    attributes: Object.freeze({ ...resource.attributes }),
})));
const reconcile = (desired, observed, actual) => {
    if (desired.length === 0 && observed.length === 0 && actual.length === 0)
        return 'unknown';
    const signature = (resources) => JSON.stringify([...resources]
        .map((resource) => ({
        id: resource.resourceId,
        type: resource.resourceType,
        attributes: resource.attributes,
    }))
        .sort((a, b) => a.id.localeCompare(b.id)));
    const desiredSignature = signature(desired);
    const observedSignature = signature(observed);
    const actualSignature = signature(actual);
    if (desiredSignature === actualSignature && actualSignature === observedSignature)
        return 'aligned';
    if (desiredSignature !== actualSignature && observedSignature === actualSignature)
        return 'pending';
    if (desiredSignature === actualSignature && observedSignature !== actualSignature)
        return 'drifted';
    return 'conflicted';
};
export class InMemoryNetworkStateStore {
    snapshot = EMPTY_STATE;
    get() {
        return this.snapshot;
    }
    apply(update) {
        if (update.expectedStateVersion !== undefined &&
            update.expectedStateVersion !== this.snapshot.stateVersion) {
            throw new Error(`Network state version conflict: expected ${update.expectedStateVersion}, actual ${this.snapshot.stateVersion}`);
        }
        const next = {
            ...this.snapshot,
            id: `network-state:${this.snapshot.stateVersion + 1}`,
            createdAt: new Date().toISOString(),
            stateVersion: this.snapshot.stateVersion + 1,
            [update.layer]: freezeResources(update.resources),
        };
        this.snapshot = Object.freeze({
            ...next,
            reconciliation: reconcile(next.desired, next.observed, next.actual),
        });
        return this.snapshot;
    }
}
//# sourceMappingURL=network-state.js.map