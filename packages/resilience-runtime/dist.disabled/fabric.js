import { FabricCapabilityAuthority, } from './fabric-authority.js';
import { SELECTABLE_FABRIC_STATES, assertFabricStateTransition, evaluateFabricFreshness, partitionByFreshness, selectDiverseResources, } from './fabric-lifecycle.js';
export const FABRIC_RESOURCE_KINDS = [
    'Device', 'Interface', 'Link', 'Provider', 'Gateway', 'Route', 'Resolver', 'Tunnel',
    'Transport', 'Proxy', 'Egress', 'RemoteNode', 'Region', 'Destination', 'Service',
    'Endpoint', 'ApplicationPath',
];
export const FABRIC_RESOURCE_STATES = [
    'UNKNOWN', 'DISCOVERING', 'HEALTHY', 'DEGRADED', 'FAILED', 'BLOCKED', 'RESTRICTED',
    'RECOVERING', 'QUARANTINED', 'DRAINING', 'UNAVAILABLE',
];
const nowIso = () => new Date().toISOString();
const numericCost = (resource) => Object.values(resource.cost).reduce((sum, value) => sum + Math.max(0, value), 0);
const healthRank = (resource) => resource.health.score * 0.45 + resource.confidence * 100 * 0.25 + resource.trust * 100 * 0.2 - numericCost(resource) * 0.1;
const intentString = (intent, keys) => {
    if (!intent)
        return undefined;
    for (const key of keys) {
        const target = intent.target[key];
        const constraint = intent.constraints[key];
        const value = target ?? constraint;
        if (typeof value === 'string' && value.trim())
            return value.trim();
    }
    return undefined;
};
const intentNumber = (intent, key) => {
    const value = intent?.constraints[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};
/**
 * Compiles the deliberately small Phase 93 routing vocabulary from a compiled
 * intent. Unknown constraints are not interpreted as routing authority.
 */
export const deriveIntentRoutingPreferences = (intent) => {
    const application = intentString(intent, ['routing.application', 'application', 'workload', 'service']);
    const maximumCost = intentNumber(intent, 'routing.maximumCost');
    const minimumTrust = intentNumber(intent, 'routing.minimumTrust');
    const preferredFailureDomain = intentString(intent, ['routing.preferredFailureDomain']);
    const requiredCapability = intentString(intent, ['routing.requiredCapability']);
    if (maximumCost !== undefined && maximumCost < 0) {
        return { preferredFailureDomains: [], requiredCapabilities: [], invalidReason: 'invalid-intent-routing-maximum-cost' };
    }
    if (minimumTrust !== undefined && (minimumTrust < 0 || minimumTrust > 1)) {
        return { preferredFailureDomains: [], requiredCapabilities: [], invalidReason: 'invalid-intent-routing-minimum-trust' };
    }
    return Object.freeze({
        ...(application ? { application } : {}),
        ...(maximumCost !== undefined ? { maximumCost } : {}),
        ...(minimumTrust !== undefined ? { minimumTrust } : {}),
        preferredFailureDomains: Object.freeze(preferredFailureDomain ? [preferredFailureDomain] : []),
        requiredCapabilities: Object.freeze(requiredCapability ? [requiredCapability] : []),
    });
};
const applicationAffinityRank = (resource, application) => {
    if (!application)
        return 0;
    const expected = application.toLocaleLowerCase();
    const values = ['application', 'app', 'workload', 'service']
        .map((key) => resource.metadata[key])
        .filter((value) => typeof value === 'string');
    return values.some((value) => value.toLocaleLowerCase() === expected) ? 1 : 0;
};
export class ProgrammableConnectivityFabric {
    capabilityAuthority = new FabricCapabilityAuthority();
    providers = new Map();
    snapshot = Object.freeze({
        version: 0,
        discoveredAt: new Date(0).toISOString(),
        resources: Object.freeze([]),
        edges: Object.freeze([]),
    });
    registerProvider(provider) {
        if (!provider.id.trim() || !provider.owner.trim())
            throw new Error('fabric provider id and owner are required');
        if (this.providers.has(provider.id))
            throw new Error(`fabric provider already registered: ${provider.id}`);
        this.providers.set(provider.id, provider);
    }
    providersList() { return [...this.providers.values()]; }
    snapshotState() { return this.snapshot; }
    ownershipIndex() {
        return Object.freeze(Object.fromEntries(this.snapshot.resources.map((resource) => [resource.id, resource.owner])));
    }
    resourcesOwnedBy(owner) {
        return Object.freeze(this.snapshot.resources.filter((resource) => resource.owner === owner));
    }
    freshnessReport(now = nowIso()) {
        return Object.freeze(this.snapshot.resources.map((resource) => evaluateFabricFreshness(resource, now)));
    }
    pruneExpired(now = nowIso()) {
        const { fresh, stale } = partitionByFreshness(this.snapshot.resources, now);
        if (stale.length === 0)
            return this.snapshot;
        const retained = new Set(fresh.map((resource) => resource.id));
        this.snapshot = Object.freeze({
            ...this.snapshot,
            version: this.snapshot.version + 1,
            discoveredAt: now,
            resources: Object.freeze([...fresh]),
            edges: Object.freeze(this.snapshot.edges.filter((edge) => retained.has(edge.from) && retained.has(edge.to))),
        });
        return this.snapshot;
    }
    async discover(options = {}) {
        const signal = options.signal ?? new AbortController().signal;
        const limit = Math.max(1, Math.min(options.limit ?? 256, 2_000));
        const context = { signal, limit, now: nowIso(), ...(options.since ? { since: options.since } : {}) };
        const resources = new Map(options.since ? this.snapshot.resources.map((resource) => [resource.id, resource]) : []);
        const owners = new Map(options.since ? this.snapshot.resources.map((resource) => [resource.id, resource.owner]) : []);
        for (const provider of this.providers.values()) {
            if (signal.aborted)
                throw new DOMException('Fabric discovery aborted', 'AbortError');
            const discovered = await provider.discover(context);
            if (signal.aborted)
                throw new DOMException('Fabric discovery aborted', 'AbortError');
            for (const resource of discovered.slice(0, limit)) {
                const existingOwner = owners.get(resource.id);
                if (existingOwner && existingOwner !== resource.owner)
                    throw new Error(`duplicate fabric ownership for resource ${resource.id}`);
                owners.set(resource.id, resource.owner);
                assertFabricStateTransition(resources.get(resource.id)?.state ?? 'UNKNOWN', resource.state);
                this.registerProviderCapabilities(resource);
                resources.set(resource.id, resource);
                if (!options.since && resources.size >= limit)
                    break;
            }
            if (!options.since && resources.size >= limit)
                break;
        }
        const boundedResources = options.since
            ? [...resources.values()].sort((a, b) => a.id.localeCompare(b.id))
            : [...resources.values()].slice(0, limit).sort((a, b) => a.id.localeCompare(b.id));
        this.snapshot = Object.freeze({ version: this.snapshot.version + 1, discoveredAt: context.now, resources: Object.freeze(boundedResources), edges: this.snapshot.edges });
        return this.snapshot;
    }
    registerProviderCapabilities(resource) {
        for (const capability of resource.capabilities) {
            const existing = this.capabilityAuthority.get(capability.id);
            if (existing === undefined) {
                this.capabilityAuthority.register(capability);
                continue;
            }
            const sameScope = existing.scope === capability.scope && existing.authority === capability.authority && existing.trust === capability.trust;
            if (!sameScope)
                throw new Error(`fabric capability scope conflict for ${capability.id}: already registered with a different scope/authority/trust`);
        }
    }
    select(request = {}) {
        const now = request.now ?? nowIso();
        const rejected = [];
        const capabilityDecisions = [];
        const preferences = deriveIntentRoutingPreferences(request.intent);
        const maximumCost = request.maximumCost ?? preferences.maximumCost;
        const minimumTrust = Math.max(request.minimumTrust ?? 0, preferences.minimumTrust ?? 0);
        const requiredCapabilities = [...new Set([...(request.requiredCapabilities ?? []), ...preferences.requiredCapabilities])];
        const preferredFailureDomains = [...new Set([...(request.preferredFailureDomains ?? []), ...preferences.preferredFailureDomains])];
        const criteria = [
            'freshness', 'selectable-state', 'trust', 'cost', 'capabilities', 'health', 'confidence', 'failure-domain-diversity',
            ...(preferences.application ? ['application-affinity'] : []),
        ];
        if (preferences.invalidReason) {
            const audit = Object.freeze({
                ...(request.intent ? { intentId: request.intent.intentId } : {}),
                criteria: Object.freeze(criteria), candidateIds: Object.freeze([]),
                rejected: Object.freeze([{ id: request.intent?.intentId ?? 'intent', reason: preferences.invalidReason }]), evaluatedAt: now,
            });
            return Object.freeze({ selected: undefined, candidates: Object.freeze([]), rejected: audit.rejected, reason: `fail-closed: ${preferences.invalidReason}`, freshness: Object.freeze([]), capabilityDecisions: Object.freeze([]), audit });
        }
        const freshness = this.snapshot.resources.map((resource) => evaluateFabricFreshness(resource, now, request.maxAgeMs));
        const freshnessById = new Map(freshness.map((report) => [report.resourceId, report]));
        const eligible = this.snapshot.resources.filter((resource) => {
            if (request.kind && resource.kind !== request.kind) {
                rejected.push({ id: resource.id, reason: 'kind-mismatch' });
                return false;
            }
            if (freshnessById.get(resource.id)?.fresh !== true) {
                rejected.push({ id: resource.id, reason: 'stale-resource' });
                return false;
            }
            if (!SELECTABLE_FABRIC_STATES.has(resource.state)) {
                rejected.push({ id: resource.id, reason: `state-${resource.state.toLowerCase()}` });
                return false;
            }
            if (resource.trust < minimumTrust) {
                rejected.push({ id: resource.id, reason: 'insufficient-trust' });
                return false;
            }
            if (maximumCost !== undefined && numericCost(resource) > maximumCost) {
                rejected.push({ id: resource.id, reason: 'cost-limit' });
                return false;
            }
            const required = requiredCapabilities;
            const missing = required.filter((capability) => !resource.capabilities.some((candidate) => candidate.id === capability));
            if (missing.length) {
                rejected.push({ id: resource.id, reason: `missing-capability:${missing.join(',')}` });
                return false;
            }
            const capabilityRequests = required.map((capabilityId) => ({ capabilityId, resourceId: resource.id, ...(request.platform ? { platform: request.platform } : {}), ...(minimumTrust > 0 ? { minimumTrust } : {}), ...(request.maximumSafety ? { maximumSafety: request.maximumSafety } : {}), ...(request.requireRuntimeAuthority ? { requireRuntimeAuthority: true } : {}) }));
            if (capabilityRequests.length > 0) {
                const decision = this.capabilityAuthority.authorizeAll(capabilityRequests);
                if (!decision.allowed) {
                    rejected.push({ id: resource.id, reason: `capability-denied:${decision.reasons.join(',')}` });
                    return false;
                }
                capabilityDecisions.push(decision);
            }
            return true;
        });
        const candidates = [...eligible].sort((a, b) => {
            const affinityA = applicationAffinityRank(a, preferences.application);
            const affinityB = applicationAffinityRank(b, preferences.application);
            const diversityA = preferredFailureDomains.some((d) => a.failureDomains.includes(d)) ? 1 : 0;
            const diversityB = preferredFailureDomains.some((d) => b.failureDomains.includes(d)) ? 1 : 0;
            return affinityB - affinityA || diversityB - diversityA || healthRank(b) - healthRank(a) || a.id.localeCompare(b.id);
        });
        const requiredDiverse = request.minimumDiverseAlternatives ?? 1;
        const diversity = selectDiverseResources(candidates, { required: requiredDiverse });
        const selected = diversity.selected ?? candidates[0];
        const diversityShortfall = request.minimumDiverseAlternatives !== undefined && request.minimumDiverseAlternatives > 1 && selected !== undefined && diversity.diverse.length < requiredDiverse;
        if (diversityShortfall)
            for (const candidate of diversity.diverse)
                rejected.push({ id: candidate.id, reason: 'insufficient-failure-domain-diversity' });
        const finalSelected = diversityShortfall ? undefined : selected;
        const audit = Object.freeze({
            ...(request.intent ? { intentId: request.intent.intentId } : {}),
            ...(preferences.application ? { applicationAffinity: preferences.application } : {}),
            criteria: Object.freeze(criteria), ...(finalSelected ? { selectedId: finalSelected.id } : {}),
            candidateIds: Object.freeze(candidates.map((candidate) => candidate.id)), rejected: Object.freeze([...rejected]), evaluatedAt: now,
        });
        return Object.freeze({
            selected: finalSelected,
            candidates,
            rejected: Object.freeze(rejected),
            reason: !selected ? 'no eligible fabric resource' : diversityShortfall ? `fail-closed: ${diversity.reason}` : diversity.reason,
            diversity,
            freshness: Object.freeze(freshness),
            capabilityDecisions: Object.freeze(capabilityDecisions),
            audit,
        });
    }
    reconcileRoutingGraph(graph) {
        const resources = new Map(this.snapshot.resources.map((resource) => [resource.id, resource]));
        const graphNodeIds = new Map(graph.nodes.map((node) => [node.id, fabricResourceIdFromPathNode(node)]));
        const domainsByPathNode = new Map((graph.entries ?? []).map(({ path, evidence }) => [`path:${path.id}`, evidence.failureDomains]));
        for (const node of graph.nodes) {
            const resource = resourceFromPathNode(node, domainsByPathNode.get(node.id));
            const previous = resources.get(resource.id);
            const next = transitionedResource(previous, resource);
            if (previous !== undefined && previous.owner !== resource.owner)
                throw new Error(`duplicate fabric ownership for resource ${resource.id}`);
            resources.set(resource.id, next);
            this.registerProviderCapabilities(next);
        }
        const edges = graph.edges.map((edge) => ({ from: graphNodeIds.get(edge.from) ?? edge.from, to: graphNodeIds.get(edge.to) ?? edge.to, relation: edge.kind }));
        this.snapshot = Object.freeze({ ...this.snapshot, version: this.snapshot.version + 1, discoveredAt: nowIso(), resources: Object.freeze([...resources.values()].sort((a, b) => a.id.localeCompare(b.id))), edges: Object.freeze(edges) });
        return this.snapshot;
    }
}
const kindForNode = (node) => {
    switch (node.kind) {
        case 'interface': return 'Interface';
        case 'route': return 'Route';
        case 'gateway': return 'Gateway';
        case 'provider': return 'Provider';
        case 'tunnel': return 'Tunnel';
        case 'transport': return 'Transport';
        case 'egress': return 'Egress';
        case 'region': return 'Region';
        case 'destination': return 'Destination';
        case 'path': return 'ApplicationPath';
    }
};
const resourceIdFromPathNode = (node) => node.id.includes(':') ? node.id.slice(node.id.indexOf(':') + 1) : node.id;
const fabricResourceIdFromPathNode = (node) => `fabric:${kindForNode(node).toLowerCase()}:${resourceIdFromPathNode(node)}`;
const resourceFromPathNode = (node, evidenceFailureDomains) => {
    const kind = kindForNode(node);
    const failed = ['failed', 'disabled', 'expired'].includes(node.state);
    const state = failed ? 'FAILED' : node.state === 'degraded' ? 'DEGRADED' : 'HEALTHY';
    const declared = node.metadata.failureDomains;
    const failureDomains = evidenceFailureDomains && evidenceFailureDomains.length > 0
        ? [...evidenceFailureDomains]
        : Array.isArray(declared) ? declared.filter((value) => typeof value === 'string')
            : typeof declared === 'string' ? [declared] : [];
    return {
        id: fabricResourceIdFromPathNode(node), kind, state,
        health: { status: failed ? 'failed' : node.state === 'degraded' ? 'degraded' : 'healthy', score: failed ? 0 : node.state === 'degraded' ? 50 : 90, checkedAt: nowIso() },
        confidence: 0.8, observedAt: nowIso(), trust: 0.8, capacity: {}, cost: {},
        owner: '@irp/routing:NetworkPathGraph', failureDomains, lifecycle: 'active', capabilities: [], metadata: { ...node.metadata },
    };
};
const transitionedResource = (previous, next) => {
    if (!previous)
        return next;
    if (previous.state === 'FAILED' && next.state === 'HEALTHY') {
        assertFabricStateTransition(previous.state, 'RECOVERING');
        assertFabricStateTransition('RECOVERING', next.state);
        return { ...next, metadata: { ...next.metadata, recoveredFrom: previous.state } };
    }
    assertFabricStateTransition(previous.state, next.state);
    return next;
};
//# sourceMappingURL=fabric.js.map