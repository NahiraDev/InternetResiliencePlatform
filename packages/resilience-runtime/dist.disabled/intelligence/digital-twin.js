/**
 * Phase 125 — Network Simulation / Digital Twin.
 *
 * Builds an isolated twin of a fabric snapshot, applies hypothetical faults or
 * changes to the copy and reports the impact using the same fabric selection
 * and dependency analysis the live system uses. The twin is a separate fabric
 * instance seeded from immutable data; it has no path back to live resources.
 */
import { ProgrammableConnectivityFabric } from '../fabric.js';
import { DependencyGraph } from '../telemetry-plane/topology.js';
export class TwinChangeError extends Error {
    constructor(message) { super(message); this.name = 'TwinChangeError'; }
}
const applyChange = (resources, change) => {
    const touched = [];
    const mutate = (id, f) => {
        const r = resources.get(id);
        if (!r)
            throw new TwinChangeError(`unknown resource ${id}`);
        resources.set(id, Object.freeze(f(r)));
        touched.push(id);
    };
    const asState = (s, status, score) => (r) => ({ ...r, state: s, health: { ...r.health, status, score } });
    switch (change.type) {
        case 'fail':
            mutate(change.resourceId, asState('FAILED', 'failed', 0));
            break;
        case 'degrade':
            mutate(change.resourceId, asState('DEGRADED', 'degraded', Math.max(0, Math.min(100, change.healthScore))));
            break;
        case 'recover':
            mutate(change.resourceId, asState('HEALTHY', 'healthy', 90));
            break;
        case 'set-cost':
            mutate(change.resourceId, (r) => ({ ...r, cost: { ...change.cost } }));
            break;
        case 'fail-domain': {
            const hits = [...resources.values()].filter((r) => r.failureDomains.includes(change.failureDomain));
            if (hits.length === 0)
                throw new TwinChangeError(`no resources in failure domain ${change.failureDomain}`);
            for (const r of hits)
                mutate(r.id, asState('FAILED', 'failed', 0));
            break;
        }
    }
    return touched;
};
const seedTwin = async (resources, now) => {
    const twin = new ProgrammableConnectivityFabric();
    twin.registerProvider({ id: 'twin-seed', owner: 'digital-twin', async discover() { return resources.map((r) => ({ ...r, owner: 'digital-twin' })); } });
    // The twin starts from every resource's own state; transitions are validated against UNKNOWN so use a fresh discover.
    await twin.discover({ limit: Math.max(1, resources.length) });
    void now;
    return twin;
};
const selectionOf = (twin, request, now) => {
    const r = twin.select({ ...request, now });
    return Object.freeze({ ...(r.selected ? { selectedId: r.selected.id } : {}), candidateIds: Object.freeze(r.candidates.map((c) => c.id)), reason: r.reason });
};
export const simulateChanges = async (snapshot, changes, request, now) => {
    const baseline = new Map(snapshot.resources.map((r) => [r.id, r]));
    const changed = new Map(baseline);
    const touched = new Set();
    for (const c of changes)
        for (const id of applyChange(changed, c))
            touched.add(id);
    // HEALTHY->FAILED transitions are legal directly; DEGRADED->HEALTHY etc. are replayed against UNKNOWN in a fresh twin.
    const beforeTwin = await seedTwin([...baseline.values()].map((r) => ({ ...r, state: r.state })), now);
    const afterTwin = await seedTwin([...changed.values()], now);
    const before = selectionOf(beforeTwin, request, now);
    const after = selectionOf(afterTwin, request, now);
    const lost = before.candidateIds.filter((id) => !after.candidateIds.includes(id));
    const beforeSpof = new Set(new DependencyGraph({ resources: [...baseline.values()], edges: snapshot.edges }).singlePointsOfFailure().map((s) => s.resourceId));
    const afterGraph = new DependencyGraph({ resources: [...changed.values()].filter((r) => r.state !== 'FAILED'), edges: snapshot.edges });
    const afterSpof = afterGraph.singlePointsOfFailure();
    const newSpof = afterSpof.filter((s) => !beforeSpof.has(s.resourceId)).map((s) => s.resourceId).sort();
    const stranded = new Set();
    for (const id of touched) {
        if (changed.get(id)?.state !== 'FAILED')
            continue;
        for (const dep of new DependencyGraph({ resources: [...baseline.values()], edges: snapshot.edges }).impactOf(id).directDependents) {
            const alternatives = new DependencyGraph({ resources: [...baseline.values()], edges: snapshot.edges }).dependenciesOf(dep).filter((d) => d !== id && changed.get(d)?.state !== 'FAILED' && changed.get(d)?.kind === baseline.get(id)?.kind);
            if (alternatives.length === 0)
                stranded.add(dep);
        }
    }
    const selectionChanged = before.selectedId !== after.selectedId;
    const verdict = after.selectedId === undefined && before.selectedId !== undefined ? 'outage' : selectionChanged ? 'reroute' : lost.length > 0 || newSpof.length > 0 ? 'degraded-redundancy' : 'no-impact';
    return Object.freeze({
        changes: Object.freeze([...changes]), changedResources: Object.freeze([...touched].sort()), before, after, selectionChanged,
        lostSelectable: Object.freeze(lost.sort()), newSinglePointsOfFailure: Object.freeze(newSpof), strandedDependents: Object.freeze([...stranded].sort()), verdict,
    });
};
//# sourceMappingURL=digital-twin.js.map