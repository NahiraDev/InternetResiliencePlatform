import type { NetworkPathGraph, PathGraphNode } from '@irp/routing';
import {
  FabricCapabilityAuthority,
  type CapabilityDecision,
  type CapabilityRequest,
  type FabricPlatform,
} from './fabric-authority.js';
import {
  SELECTABLE_FABRIC_STATES,
  assertFabricStateTransition,
  evaluateFabricFreshness,
  partitionByFreshness,
  selectDiverseResources,
  type DiverseSelection,
  type FreshnessReport,
} from './fabric-lifecycle.js';

export const FABRIC_RESOURCE_KINDS = [
  'Device', 'Interface', 'Link', 'Provider', 'Gateway', 'Route', 'Resolver', 'Tunnel',
  'Transport', 'Proxy', 'Egress', 'RemoteNode', 'Region', 'Destination', 'Service',
  'Endpoint', 'ApplicationPath',
] as const;
export type FabricResourceKind = (typeof FABRIC_RESOURCE_KINDS)[number];

export const FABRIC_RESOURCE_STATES = [
  'UNKNOWN', 'DISCOVERING', 'HEALTHY', 'DEGRADED', 'FAILED', 'BLOCKED', 'RESTRICTED',
  'RECOVERING', 'QUARANTINED', 'DRAINING', 'UNAVAILABLE',
] as const;
export type FabricResourceState = (typeof FABRIC_RESOURCE_STATES)[number];
export type FabricLifecycle = 'discovered' | 'active' | 'draining' | 'retired';

export interface FabricCapability {
  readonly id: string;
  readonly scope: string;
  readonly authority: 'runtime' | 'adapter' | 'provider' | 'external';
  readonly trust: number;
  readonly safety: 'read-only' | 'safe' | 'governed';
  readonly platforms: readonly string[];
}
export interface FabricHealth {
  readonly status: 'healthy' | 'degraded' | 'failed' | 'unknown';
  readonly score: number;
  readonly checkedAt: string;
}
export interface FabricResource {
  readonly id: string;
  readonly kind: FabricResourceKind;
  readonly state: FabricResourceState;
  readonly health: FabricHealth;
  readonly confidence: number;
  readonly observedAt: string;
  readonly expiresAt?: string;
  readonly trust: number;
  readonly capacity: Readonly<Record<string, number>>;
  readonly cost: Readonly<Record<string, number>>;
  readonly owner: string;
  readonly failureDomains: readonly string[];
  readonly lifecycle: FabricLifecycle;
  readonly capabilities: readonly FabricCapability[];
  readonly metadata: Readonly<Record<string, unknown>>;
}
export interface FabricEdge { readonly from: string; readonly to: string; readonly relation: string; }
export interface FabricSnapshot {
  readonly version: number;
  readonly discoveredAt: string;
  readonly resources: readonly FabricResource[];
  readonly edges: readonly FabricEdge[];
}
export interface FabricDiscoveryContext {
  readonly signal: AbortSignal;
  readonly limit: number;
  readonly now: string;
  readonly since?: string;
}
export interface FabricDiscoveryProvider {
  readonly id: string;
  readonly owner: string;
  discover(context: FabricDiscoveryContext): Promise<readonly FabricResource[]>;
}
export interface FabricSelectionRequest {
  readonly kind?: FabricResourceKind;
  readonly requiredCapabilities?: readonly string[];
  readonly preferredFailureDomains?: readonly string[];
  readonly minimumTrust?: number;
  readonly maximumCost?: number;
  readonly now?: string;
  readonly platform?: FabricPlatform;
  readonly maximumSafety?: FabricCapability['safety'];
  readonly requireRuntimeAuthority?: boolean;
  readonly minimumDiverseAlternatives?: number;
  readonly maxAgeMs?: number;
}
export interface FabricSelectionResult {
  readonly selected: FabricResource | undefined;
  readonly candidates: readonly FabricResource[];
  readonly rejected: readonly { id: string; reason: string }[];
  readonly reason: string;
  readonly diversity?: DiverseSelection;
  readonly freshness?: readonly FreshnessReport[];
  readonly capabilityDecisions?: readonly CapabilityDecision[];
}

const nowIso = () => new Date().toISOString();
const numericCost = (resource: FabricResource) =>
  Object.values(resource.cost).reduce((sum, value) => sum + Math.max(0, value), 0);
const healthRank = (resource: FabricResource) =>
  resource.health.score * 0.45 + resource.confidence * 100 * 0.25 + resource.trust * 100 * 0.2 - numericCost(resource) * 0.1;

export class ProgrammableConnectivityFabric {
  readonly capabilityAuthority = new FabricCapabilityAuthority();
  private readonly providers = new Map<string, FabricDiscoveryProvider>();
  private snapshot: FabricSnapshot = Object.freeze({
    version: 0,
    discoveredAt: new Date(0).toISOString(),
    resources: Object.freeze([]),
    edges: Object.freeze([]),
  });

  registerProvider(provider: FabricDiscoveryProvider): void {
    if (!provider.id.trim() || !provider.owner.trim()) throw new Error('fabric provider id and owner are required');
    if (this.providers.has(provider.id)) throw new Error(`fabric provider already registered: ${provider.id}`);
    this.providers.set(provider.id, provider);
  }
  providersList(): readonly FabricDiscoveryProvider[] { return [...this.providers.values()]; }
  snapshotState(): FabricSnapshot { return this.snapshot; }
  ownershipIndex(): Readonly<Record<string, string>> {
    return Object.freeze(Object.fromEntries(this.snapshot.resources.map((resource) => [resource.id, resource.owner])));
  }
  resourcesOwnedBy(owner: string): readonly FabricResource[] {
    return Object.freeze(this.snapshot.resources.filter((resource) => resource.owner === owner));
  }
  freshnessReport(now: string = nowIso()): readonly FreshnessReport[] {
    return Object.freeze(this.snapshot.resources.map((resource) => evaluateFabricFreshness(resource, now)));
  }
  pruneExpired(now: string = nowIso()): FabricSnapshot {
    const { fresh, stale } = partitionByFreshness(this.snapshot.resources, now);
    if (stale.length === 0) return this.snapshot;
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

  async discover(options: { signal?: AbortSignal; limit?: number | undefined; since?: string } = {}) {
    const signal = options.signal ?? new AbortController().signal;
    const limit = Math.max(1, Math.min(options.limit ?? 256, 2_000));
    const context: FabricDiscoveryContext = { signal, limit, now: nowIso(), ...(options.since ? { since: options.since } : {}) };
    const resources = new Map<string, FabricResource>(options.since ? this.snapshot.resources.map((resource) => [resource.id, resource]) : []);
    const owners = new Map<string, string>(options.since ? this.snapshot.resources.map((resource) => [resource.id, resource.owner]) : []);
    for (const provider of this.providers.values()) {
      if (signal.aborted) throw new DOMException('Fabric discovery aborted', 'AbortError');
      const discovered = await provider.discover(context);
      if (signal.aborted) throw new DOMException('Fabric discovery aborted', 'AbortError');
      for (const resource of discovered.slice(0, limit)) {
        const existingOwner = owners.get(resource.id);
        if (existingOwner && existingOwner !== resource.owner) throw new Error(`duplicate fabric ownership for resource ${resource.id}`);
        owners.set(resource.id, resource.owner);
        assertFabricStateTransition(resources.get(resource.id)?.state ?? 'UNKNOWN', resource.state);
        this.registerProviderCapabilities(resource);
        resources.set(resource.id, resource);
        if (!options.since && resources.size >= limit) break;
      }
      if (!options.since && resources.size >= limit) break;
    }
    const boundedResources = options.since
      ? [...resources.values()].sort((a, b) => a.id.localeCompare(b.id))
      : [...resources.values()].slice(0, limit).sort((a, b) => a.id.localeCompare(b.id));
    this.snapshot = Object.freeze({ version: this.snapshot.version + 1, discoveredAt: context.now, resources: Object.freeze(boundedResources), edges: this.snapshot.edges });
    return this.snapshot;
  }

  private registerProviderCapabilities(resource: FabricResource): void {
    for (const capability of resource.capabilities) {
      const existing = this.capabilityAuthority.get(capability.id);
      if (existing === undefined) { this.capabilityAuthority.register(capability); continue; }
      const sameScope = existing.scope === capability.scope && existing.authority === capability.authority && existing.trust === capability.trust;
      if (!sameScope) throw new Error(`fabric capability scope conflict for ${capability.id}: already registered with a different scope/authority/trust`);
    }
  }

  select(request: FabricSelectionRequest = {}): FabricSelectionResult {
    const now = request.now ?? nowIso();
    const rejected: { id: string; reason: string }[] = [];
    const capabilityDecisions: CapabilityDecision[] = [];
    const freshness: FreshnessReport[] = this.snapshot.resources.map((resource) => evaluateFabricFreshness(resource, now, request.maxAgeMs));
    const freshnessById = new Map(freshness.map((report) => [report.resourceId, report]));
    const eligible = this.snapshot.resources.filter((resource) => {
      if (request.kind && resource.kind !== request.kind) { rejected.push({ id: resource.id, reason: 'kind-mismatch' }); return false; }
      if (freshnessById.get(resource.id)?.fresh !== true) { rejected.push({ id: resource.id, reason: 'stale-resource' }); return false; }
      if (!SELECTABLE_FABRIC_STATES.has(resource.state)) { rejected.push({ id: resource.id, reason: `state-${resource.state.toLowerCase()}` }); return false; }
      if (resource.trust < (request.minimumTrust ?? 0)) { rejected.push({ id: resource.id, reason: 'insufficient-trust' }); return false; }
      if (request.maximumCost !== undefined && numericCost(resource) > request.maximumCost) { rejected.push({ id: resource.id, reason: 'cost-limit' }); return false; }
      const required = request.requiredCapabilities ?? [];
      const missing = required.filter((capability) => !resource.capabilities.some((candidate) => candidate.id === capability));
      if (missing.length) { rejected.push({ id: resource.id, reason: `missing-capability:${missing.join(',')}` }); return false; }
      const capabilityRequests: CapabilityRequest[] = required.map((capabilityId) => ({ capabilityId, resourceId: resource.id, ...(request.platform ? { platform: request.platform } : {}), ...(request.minimumTrust !== undefined ? { minimumTrust: request.minimumTrust } : {}), ...(request.maximumSafety ? { maximumSafety: request.maximumSafety } : {}), ...(request.requireRuntimeAuthority ? { requireRuntimeAuthority: true } : {}) }));
      if (capabilityRequests.length > 0) {
        const decision = this.capabilityAuthority.authorizeAll(capabilityRequests);
        if (!decision.allowed) { rejected.push({ id: resource.id, reason: `capability-denied:${decision.reasons.join(',')}` }); return false; }
        capabilityDecisions.push(decision);
      }
      return true;
    });
    const candidates = [...eligible].sort((a, b) => {
      const diversityA = request.preferredFailureDomains?.some((d) => a.failureDomains.includes(d)) ? 1 : 0;
      const diversityB = request.preferredFailureDomains?.some((d) => b.failureDomains.includes(d)) ? 1 : 0;
      return diversityB - diversityA || healthRank(b) - healthRank(a) || a.id.localeCompare(b.id);
    });
    const requiredDiverse = request.minimumDiverseAlternatives ?? 1;
    const diversity = selectDiverseResources(candidates, { required: requiredDiverse });
    const selected = diversity.selected ?? candidates[0];
    const diversityShortfall = request.minimumDiverseAlternatives !== undefined && request.minimumDiverseAlternatives > 1 && selected !== undefined && diversity.diverse.length < requiredDiverse;
    if (diversityShortfall) for (const candidate of diversity.diverse) rejected.push({ id: candidate.id, reason: 'insufficient-failure-domain-diversity' });
    return Object.freeze({
      selected: diversityShortfall ? undefined : selected,
      candidates,
      rejected: Object.freeze(rejected),
      reason: !selected ? 'no eligible fabric resource' : diversityShortfall ? `fail-closed: ${diversity.reason}` : diversity.reason,
      diversity,
      freshness: Object.freeze(freshness),
      capabilityDecisions: Object.freeze(capabilityDecisions),
    });
  }

  reconcileRoutingGraph(graph: NetworkPathGraph): FabricSnapshot {
    const resources = new Map<string, FabricResource>(this.snapshot.resources.map((resource) => [resource.id, resource]));
    const graphNodeIds = new Map(graph.nodes.map((node) => [node.id, fabricResourceIdFromPathNode(node)] as const));
    const domainsByPathNode = new Map<string, readonly string[]>((graph.entries ?? []).map(({ path, evidence }) => [`path:${path.id}`, evidence.failureDomains] as const));
    for (const node of graph.nodes) {
      const resource = resourceFromPathNode(node, domainsByPathNode.get(node.id));
      const previous = resources.get(resource.id);
      const next = transitionedResource(previous, resource);
      if (previous !== undefined && previous.owner !== resource.owner) throw new Error(`duplicate fabric ownership for resource ${resource.id}`);
      resources.set(resource.id, next);
      this.registerProviderCapabilities(next);
    }
    const edges = graph.edges.map((edge) => ({ from: graphNodeIds.get(edge.from) ?? edge.from, to: graphNodeIds.get(edge.to) ?? edge.to, relation: edge.kind }));
    this.snapshot = Object.freeze({ ...this.snapshot, version: this.snapshot.version + 1, discoveredAt: nowIso(), resources: Object.freeze([...resources.values()].sort((a, b) => a.id.localeCompare(b.id))), edges: Object.freeze(edges) });
    return this.snapshot;
  }
}

const kindForNode = (node: PathGraphNode): FabricResourceKind => {
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
const resourceIdFromPathNode = (node: PathGraphNode): string => node.id.includes(':') ? node.id.slice(node.id.indexOf(':') + 1) : node.id;
const fabricResourceIdFromPathNode = (node: PathGraphNode): string => `fabric:${kindForNode(node).toLowerCase()}:${resourceIdFromPathNode(node)}`;

const resourceFromPathNode = (node: PathGraphNode, evidenceFailureDomains?: readonly string[]): FabricResource => {
  const kind = kindForNode(node);
  const failed = ['failed', 'disabled', 'expired'].includes(node.state);
  const state: FabricResourceState = failed ? 'FAILED' : node.state === 'degraded' ? 'DEGRADED' : 'HEALTHY';
  const declared = node.metadata.failureDomains;
  const failureDomains = evidenceFailureDomains && evidenceFailureDomains.length > 0
    ? [...evidenceFailureDomains]
    : Array.isArray(declared) ? declared.filter((value): value is string => typeof value === 'string')
    : typeof declared === 'string' ? [declared] : [];
  return {
    id: fabricResourceIdFromPathNode(node), kind, state,
    health: { status: failed ? 'failed' : node.state === 'degraded' ? 'degraded' : 'healthy', score: failed ? 0 : node.state === 'degraded' ? 50 : 90, checkedAt: nowIso() },
    confidence: 0.8, observedAt: nowIso(), trust: 0.8, capacity: {}, cost: {},
    owner: '@irp/routing:NetworkPathGraph', failureDomains, lifecycle: 'active', capabilities: [], metadata: { ...node.metadata },
  };
};

const transitionedResource = (previous: FabricResource | undefined, next: FabricResource): FabricResource => {
  if (!previous) return next;
  if (previous.state === 'FAILED' && next.state === 'HEALTHY') {
    assertFabricStateTransition(previous.state, 'RECOVERING');
    assertFabricStateTransition('RECOVERING', next.state);
    return { ...next, metadata: { ...next.metadata, recoveredFrom: previous.state } };
  }
  assertFabricStateTransition(previous.state, next.state);
  return next;
};