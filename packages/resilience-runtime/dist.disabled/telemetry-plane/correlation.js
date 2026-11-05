/**
 * Phase 102 — Cross-Layer Event Correlation.
 *
 * Groups telemetry records from different network layers that share a
 * correlation id, resource lineage or tight time proximity, and orders the
 * evidence by causal layer so the lowest failing layer is reported as the root
 * cause candidate. Pure analysis: it classifies evidence, it does not act.
 */
/** Lowest layer first; a failure at a lower layer explains failures above it. */
export const CAUSAL_LAYERS = ['physical', 'link', 'network', 'tunnel', 'transport', 'dns', 'gateway', 'application'];
export const DEFAULT_CORRELATION_CONFIG = Object.freeze({
    windowMs: 30_000, failureLabel: 'status', failureValues: ['failed', 'degraded', 'critical'],
});
const layerOf = (r) => {
    const l = r.scope.layer ?? r.labels.layer;
    return CAUSAL_LAYERS.includes(l ?? '') ? l : undefined;
};
const isFailure = (r, c) => {
    const v = r.labels[c.failureLabel];
    return v !== undefined && c.failureValues.includes(v);
};
/** Union-find over record indexes so grouping is transitive and order independent. */
class Disjoint {
    parent;
    constructor(n) { this.parent = Array.from({ length: n }, (_, i) => i); }
    find(i) { let r = i; while (this.parent[r] !== r)
        r = this.parent[r]; this.parent[i] = r; return r; }
    union(a, b) { const ra = this.find(a); const rb = this.find(b); if (ra !== rb)
        this.parent[Math.max(ra, rb)] = Math.min(ra, rb); }
}
export const correlateTelemetry = (input, config = DEFAULT_CORRELATION_CONFIG) => {
    const records = [...input].sort((a, b) => a.atMs - b.atMs || a.id.localeCompare(b.id));
    const ds = new Disjoint(records.length);
    const byCorrelation = new Map();
    records.forEach((r, i) => {
        if (!r.correlationId)
            return;
        const prior = byCorrelation.get(r.correlationId);
        if (prior === undefined)
            byCorrelation.set(r.correlationId, i);
        else
            ds.union(prior, i);
    });
    // Same device/tenant failures within the window are one incident even without a shared correlation id.
    for (let i = 0; i < records.length; i += 1) {
        const a = records[i];
        if (!isFailure(a, config))
            continue;
        for (let j = i + 1; j < records.length; j += 1) {
            const b = records[j];
            if (b.atMs - a.atMs > config.windowMs)
                break;
            if (!isFailure(b, config))
                continue;
            const sameOwner = (a.scope.deviceId !== undefined && a.scope.deviceId === b.scope.deviceId) || (a.scope.tenantId !== undefined && a.scope.tenantId === b.scope.tenantId && a.scope.deviceId === undefined && b.scope.deviceId === undefined);
            if (sameOwner)
                ds.union(i, j);
        }
    }
    const groups = new Map();
    records.forEach((r, i) => { const root = ds.find(i); groups.set(root, [...(groups.get(root) ?? []), r]); });
    const result = [];
    for (const members of groups.values()) {
        const failures = members.filter((m) => isFailure(m, config));
        if (members.length < 2 && failures.length === 0)
            continue;
        const layers = [...new Set(members.map(layerOf).filter((l) => l !== undefined))].sort((a, b) => CAUSAL_LAYERS.indexOf(a) - CAUSAL_LAYERS.indexOf(b));
        const failingLayers = [...new Set(failures.map(layerOf).filter((l) => l !== undefined))].sort((a, b) => CAUSAL_LAYERS.indexOf(a) - CAUSAL_LAYERS.indexOf(b));
        const root = failingLayers[0];
        const rootRecord = root ? failures.find((f) => layerOf(f) === root) : undefined;
        const downstream = failingLayers.filter((l) => l !== root);
        const reasons = [];
        if (!root)
            reasons.push('no-failing-layer-identified');
        else if (downstream.length > 0)
            reasons.push(`lowest-failing-layer:${root}`, `explains:${downstream.join(',')}`);
        else
            reasons.push(`single-failing-layer:${root}`);
        const confidence = !root ? 0.2 : Math.min(0.95, 0.5 + 0.15 * downstream.length + (members.some((m) => m.correlationId) ? 0.1 : 0));
        const startMs = members[0].atMs;
        result.push(Object.freeze({
            groupId: `corr-${members[0].id}`, records: Object.freeze(members), layers: Object.freeze(layers),
            ...(root ? { rootCauseLayer: root } : {}), ...(rootRecord?.scope.resourceId ? { rootCauseResource: rootRecord.scope.resourceId } : {}),
            downstreamLayers: Object.freeze(downstream), confidence, startMs, endMs: members[members.length - 1].atMs, reasons: Object.freeze(reasons),
        }));
    }
    return Object.freeze(result.sort((a, b) => a.startMs - b.startMs || a.groupId.localeCompare(b.groupId)));
};
//# sourceMappingURL=correlation.js.map