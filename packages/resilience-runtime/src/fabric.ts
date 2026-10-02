import type { NetworkPathGraph, PathGraphNode } from '@irp/routing';

export const FABRIC_RESOURCE_KINDS = [
  'Device','Interface','Link','Provider','Gateway','Route','Resolver','Tunnel','Transport',
  'Proxy','Egress','RemoteNode','Region','Destination','Service','Endpoint','ApplicationPath',
] as const;
export type FabricResourceKind = (typeof FABRIC_RESOURCE_KINDS)[number];

export const FABRIC_RESOURCE_STATES = [
  'UNKNOWN','DISCOVERING','HEALTHY','DEGRADED','FAILED','BLOCKED','RESTRICTED','RECOVERING',
  'QUARANTINED','DRAINING','UNAVAILABLE',
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
export interface FabricEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: string;
}
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
}
export interface FabricSelectionResult {
  readonly selected: FabricResource | undefined;
  readonly candidates: readonly FabricResource[];
  readonly rejected: readonly { id: string; reason: string }[];
  readonly reason: string;
}

const nowIso = () => new Date().toISOString();
const fresh = (resource: FabricResource, now: string) =>
  !resource.expiresAt || Date.parse(resource.expiresAt) > Date.parse(now);
const numericCost = (resource: FabricResource) =>
  Object.values(resource.cost).reduce((sum, value) => sum + Math.max(0, value), 0);
const healthRank = (resource: FabricResource) =>
  resource.health.score * 0.45 + resource.confidence * 100 * 0.25 +
  resource.trust * 100 * 0.2 - numericCost(resource) * 0.1;

export class ProgrammableConnectivityFabric {
  private readonly providers = new Map<string, FabricDiscoveryProvider>();
  private snapshot: FabricSnapshot = Object.freeze({
    version: 0, discoveredAt: new Date(0).toISOString(),
    resources: Object.freeze([]), edges: Object.freeze([]),
  });

  registerProvider(provider: FabricDiscoveryProvider): void {
    if (!provider.id.trim() || !provider.owner.trim())
      throw new Error('fabric provider id and owner are required');
    if (this.providers.has(provider.id))
      throw new Error(`fabric provider already registered: ${provider.id}`);
    this.providers.set(provider.id, provider);
  }
  providersList(): readonly FabricDiscoveryProvider[] { return [...this.providers.values()]; }
  snapshotState(): FabricSnapshot { return this.snapshot; }

  async discover(options: { signal?: AbortSignal; limit?: number; since?: string } = {}) {
    const signal = options.signal ?? new AbortController().signal;
    const limit = Math.max(1, Math.min(options.limit ?? 256, 2_000));
    const context: FabricDiscoveryContext = {
      signal, limit, now: nowIso(), ...(options.since ? { since: options.since } : {}),
    };
    const resources = new Map<string, FabricResource>();
    const owners = new Map<string, string>();
    for (const provider of this.providers.values()) {
      if (signal.aborted) throw new DOMException('Fabric discovery aborted', 'AbortError');
      const discovered = await provider.discover(context);
      for (const resource of discovered.slice(0, limit)) {
        const existingOwner = owners.get(resource.id);
        if (existingOwner && existingOwner !== resource.owner)
          throw new Error(`duplicate fabric ownership for resource ${resource.id}`);
        owners.set(resource.id, resource.owner);
        resources.set(resource.id, resource);
        if (resources.size >= limit) break;
      }
      if (resources.size >= limit) break;
    }
    this.snapshot = Object.freeze({
      version: this.snapshot.version + 1, discoveredAt: context.now,
      resources: Object.freeze([...resources.values()].sort((a,b) => a.id.localeCompare(b.id))),
      edges: this.snapshot.edges,
    });
    return this.snapshot;
  }

  select(request: FabricSelectionRequest = {}): FabricSelectionResult {
    const now = request.now ?? nowIso();
    const rejected: { id: string; reason: string }[] = [];
    const eligible = this.snapshot.resources.filter((resource) => {
      if (request.kind && resource.kind !== request.kind) {
        rejected.push({ id: resource.id, reason: 'kind-mismatch' }); return false;
      }
      if (!fresh(resource, now)) {
        rejected.push({ id: resource.id, reason: 'stale-resource' }); return false;
      }
      if (['FAILED','BLOCKED','QUARANTINED','UNAVAILABLE','DRAINING'].includes(resource.state)) {
        rejected.push({ id: resource.id, reason: `state-${resource.state.toLowerCase()}` }); return false;
      }
      if (resource.trust < (request.minimumTrust ?? 0)) {
        rejected.push({ id: resource.id, reason: 'insufficient-trust' }); return false;
      }
      if (request.maximumCost !== undefined && numericCost(resource) > request.maximumCost) {
        rejected.push({ id: resource.id, reason: 'cost-limit' }); return false;
      }
      const missing = (request.requiredCapabilities ?? []).filter(
        capability => !resource.capabilities.some(candidate => candidate.id === capability),
      );
      if (missing.length) {
        rejected.push({ id: resource.id, reason: `missing-capability:${missing.join(',')}` }); return false;
      }
      return true;
    });
    const candidates = [...eligible].sort((a,b) => {
      const diversityA = request.preferredFailureDomains?.some(d => a.failureDomains.includes(d)) ? 1 : 0;
      const diversityB = request.preferredFailureDomains?.some(d => b.failureDomains.includes(d)) ? 1 : 0;
      return diversityB - diversityA || healthRank(b) - healthRank(a) || a.id.localeCompare(b.id);
    });
    return {
      selected: candidates[0], candidates, rejected,
      reason: candidates[0]
        ? 'selected by health, confidence, trust, cost and failure-domain diversity'
        : 'no eligible fabric resource',
    };
  }

  reconcileRoutingGraph(graph: NetworkPathGraph): FabricSnapshot {
    const resources = new Map(this.snapshot.resources);
    for (const node of graph.nodes)
      resources.set(resourceIdFromPathNode(node), resourceFromPathNode(node));
    this.snapshot = Object.freeze({
      ...this.snapshot, version: this.snapshot.version + 1, discoveredAt: nowIso(),
      resources: Object.freeze([...resources.values()].sort((a,b) => a.id.localeCompare(b.id))),
      edges: Object.freeze(graph.edges.map(edge => ({ from: edge.from, to: edge.to, relation: edge.kind }))),
    });
    return this.snapshot;
  }
}

const kindForNode = (node: PathGraphNode): FabricResourceKind => ({
  interface:'Interface', route:'Route', gateway:'Gateway', provider:'Provider', tunnel:'Tunnel',
  transport:'Transport', egress:'Egress', region:'Region', destination:'Destination',
  path:'ApplicationPath',
}[node.kind] ?? 'ApplicationPath');

const resourceIdFromPathNode = (node: PathGraphNode) =>
  node.id.includes(':') ? node.id.slice(node.id.indexOf(':') + 1) : node.id;

const resourceFromPathNode = (node: PathGraphNode): FabricResource => {
  const kind = kindForNode(node);
  const failed = ['failed','disabled','expired'].includes(node.state);
  const state: FabricResourceState = failed ? 'FAILED' : node.state === 'degraded' ? 'DEGRADED' : 'HEALTHY';
  return {
    id: `fabric:${kind.toLowerCase()}:${resourceIdFromPathNode(node)}`, kind, state,
    health: { status: failed ? 'failed' : state === 'DEGRADED' ? 'degraded' : 'healthy', score: failed ? 0 : 100, checkedAt: nowIso() },
    confidence: 0.9, observedAt: nowIso(), trust: 0.9, capacity: {}, cost: {},
    owner: '@irp/routing:NetworkPathGraph',
    failureDomains: [node.metadata.failureDomain].filter((value): value is string => typeof value === 'string'),
    lifecycle: 'discovered', capabilities: [], metadata: node.metadata,
  };
};
