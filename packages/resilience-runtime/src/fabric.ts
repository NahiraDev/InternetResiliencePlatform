import type { NetworkPathGraph, PathGraphNode } from '@irp/routing';
import {
  FabricCapabilityAuthority,
  type CapabilityDecision,
  type CapabilityRequest,
  type FabricPlatform,
} from './fabric-authority.js';
import {
  SELECTABLE_FABRIC_STATES,
  evaluateFabricFreshness,
  partitionByFreshness,
  selectDiverseResources,
  type DiverseSelection,
  type FreshnessReport,
} from './fabric-lifecycle.js';

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
export class FabricCapabilityRegistry {
  private readonly capabilities = new Map<string, FabricCapability>();

  register(capability: FabricCapability): void {
    if (!capability.id.trim() || !capability.scope.trim()) {
      throw new Error('fabric capability id and scope are required');
    }
    if (this.capabilities.has(capability.id)) {
      throw new Error(`fabric capability already registered: ${capability.id}`);
    }
    this.capabilities.set(capability.id, capability);
  }

  get(id: string): FabricCapability | undefined {
    return this.capabilities.get(id);
  }

  list(): readonly FabricCapability[] {
    return [...this.capabilities.values()];
  }
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
  /** Platform the selection must support; enforced through the capability registry. */
  readonly platform?: FabricPlatform;
  /** Safety ceiling the caller may not exceed. */
  readonly maximumSafety?: FabricCapability['safety'];
  /** Require runtime-authority capabilities only. */
  readonly requireRuntimeAuthority?: boolean;
  /** Minimum number of failure-domain-disjoint alternatives. */
  readonly minimumDiverseAlternatives?: number;
}
export interface FabricSelectionResult {
  readonly selected: FabricResource | undefined;
  readonly candidates: readonly FabricResource[];
  readonly rejected: readonly { id: string; reason: string }[];
  readonly reason: string;
  /** Failure-domain-disjoint alternatives backing the selection. */
  readonly diversity?: DiverseSelection;
  /** Per-resource freshness evidence at decision time. */
  readonly freshness?: readonly FreshnessReport[];
  /** Capability authorization evidence for the selected resource. */
  readonly capabilityDecisions?: readonly CapabilityDecision[];
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
  readonly capabilities = new FabricCapabilityRegistry();
  /** Enforceable capability authority consulted during selection (issue #275 task 5). */
  readonly capabilityAuthority = new FabricCapabilityAuthority();
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

  /** Explicit ownership index: resource id -> owner (issue #275 task 8). */
  ownershipIndex(): Readonly<Record<string, string>> {
    return Object.freeze(
      Object.fromEntries(this.snapshot.resources.map((resource) => [resource.id, resource.owner])),
    );
  }

  /** Resources owned by a given owner, for duplicate-ownership auditing. */
  resourcesOwnedBy(owner: string): readonly FabricResource[] {
    return Object.freeze(this.snapshot.resources.filter((resource) => resource.owner === owner));
  }

  /** Freshness evidence for the current snapshot (issue #275 task 4). */
  freshnessReport(now: string = nowIso()): readonly FreshnessReport[] {
    return Object.freeze(
      this.snapshot.resources.map((resource) => evaluateFabricFreshness(resource, now)),
    );
  }

  /** Drops resources whose evidence has expired, keeping the graph consistent. */
  pruneExpired(now: string = nowIso()): FabricSnapshot {
    const { fresh, stale } = partitionByFreshness(this.snapshot.resources, now);
    if (stale.length === 0) return this.snapshot;
    const retained = new Set(fresh.map((resource) => resource.id));
    this.snapshot = Object.freeze({
      ...this.snapshot,
      version: this.snapshot.version + 1,
      discoveredAt: now,
      resources: Object.freeze([...fresh]),
      edges: Object.freeze(
        this.snapshot.edges.filter((edge) => retained.has(edge.from) && retained.has(edge.to)),
      ),
    });
    return this.snapshot;
  }

  async discover(options: { signal?: AbortSignal; limit?: number | undefined; since?: string } = {}) {
    const signal = options.signal ?? new AbortController().signal;
    const limit = Math.max(1, Math.min(options.limit ?? 256, 2_000));
    const context: FabricDiscoveryContext = {
      signal, limit, now: nowIso(), ...(options.since ? { since: options.since } : {}),
    };
    const resources = new Map<string, FabricResource>(
      options.since
        ? this.snapshot.resources.map((resource) => [resource.id, resource])
        : [],
    );
    const owners = new Map<string, string>(
      options.since
        ? this.snapshot.resources.map((resource) => [resource.id, resource.owner])
        : [],
    );
    for (const provider of this.providers.values()) {
      if (signal.aborted) throw new DOMException('Fabric discovery aborted', 'AbortError');
      const discovered = await provider.discover(context);
      if (signal.aborted) {
        throw new DOMException('Fabric discovery aborted', 'AbortError');
      }
      for (const resource of discovered.slice(0, limit)) {
        const existingOwner = owners.get(resource.id);
        if (existingOwner && existingOwner !== resource.owner)
          throw new Error(`duplicate fabric ownership for resource ${resource.id}`);
        owners.set(resource.id, resource.owner);
        // Register any capability the provider claims so the unified registry
        // can authorize it during selection.
        for (const capability of resource.capabilities) {
          if (!this.capabilityAuthority.get(capability.id)) {
            this.capabilityAuthority.register(capability);
          }
        }
        resources.set(resource.id, resource);
        if (!options.since && resources.size >= limit) break;
      }
      if (!options.since && resources.size >= limit) break;
    }

    const boundedResources = options.since
      ? [...resources.values()].sort((a, b) => a.id.localeCompare(b.id))
      : [...resources.values()].slice(0, limit).sort((a, b) => a.id.localeCompare(b.id));

    this.snapshot = Object.freeze({
      version: this.snapshot.version + 1,
      discoveredAt: context.now,
      resources: Object.freeze(boundedResources),
      edges: this.snapshot.edges,
    });
    // Freshness-aware discovery records evidence with an explicit observation
    // time and optional expiry; staleness is surfaced via `freshnessReport` and
    // honoured by `select`, never silently deleted here. Callers that want to
    // compact explicitly invoke `pruneExpired`.
    return this.snapshot;
  }

  select(request: FabricSelectionRequest = {}): FabricSelectionResult {
    const now = request.now ?? nowIso();
    const rejected: { id: string; reason: string }[] = [];
    const capabilityDecisions: CapabilityDecision[] = [];
    const freshness: FreshnessReport[] = this.snapshot.resources.map((resource) =>
      evaluateFabricFreshness(resource, now),
    );
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
      if (resource.trust < (request.minimumTrust ?? 0)) {
        rejected.push({ id: resource.id, reason: 'insufficient-trust' });
        return false;
      }
      if (request.maximumCost !== undefined && numericCost(resource) > request.maximumCost) {
        rejected.push({ id: resource.id, reason: 'cost-limit' });
        return false;
      }
      // Capabilities are authorized through the unified registry, not trusted
      // from the resource-local claim alone.
      const required = request.requiredCapabilities ?? [];
      const missing = required.filter(
        (capability) => !resource.capabilities.some((candidate) => candidate.id === capability),
      );
      if (missing.length) {
        rejected.push({ id: resource.id, reason: `missing-capability:${missing.join(',')}` });
        return false;
      }
      const capabilityRequests: CapabilityRequest[] = required.map((capabilityId) => ({
        capabilityId,
        resourceId: resource.id,
        ...(request.platform ? { platform: request.platform } : {}),
        ...(request.minimumTrust !== undefined ? { minimumTrust: request.minimumTrust } : {}),
        ...(request.maximumSafety ? { maximumSafety: request.maximumSafety } : {}),
        ...(request.requireRuntimeAuthority ? { requireRuntimeAuthority: true } : {}),
      }));
      if (capabilityRequests.length > 0) {
        const decision = this.capabilityAuthority.authorizeAll(capabilityRequests);
        if (!decision.allowed) {
          rejected.push({
            id: resource.id,
            reason: `capability-denied:${decision.reasons.join(',')}`,
          });
          return false;
        }
        capabilityDecisions.push(decision);
      }
      return true;
    });

    const candidates = [...eligible].sort((a, b) => {
      const diversityA = request.preferredFailureDomains?.some((d) =>
        a.failureDomains.includes(d),
      )
        ? 1
        : 0;
      const diversityB = request.preferredFailureDomains?.some((d) =>
        b.failureDomains.includes(d),
      )
        ? 1
        : 0;
      return diversityB - diversityA || healthRank(b) - healthRank(a) || a.id.localeCompare(b.id);
    });

    // True failure-domain diversity: pick mutually disjoint candidates rather
    // than assuming the top-ranked candidate is independent.
    const diversity = selectDiverseResources(candidates, {
      required: request.minimumDiverseAlternatives ?? 2,
    });
    const selected = diversity.selected ?? candidates[0];

    return Object.freeze({
      selected,
      candidates,
      rejected: Object.freeze(rejected),
      reason: selected
        ? diversity.reason
        : 'no eligible fabric resource',
      diversity,
      freshness: Object.freeze(freshness),
      capabilityDecisions: Object.freeze(capabilityDecisions),
    });
  }

  reconcileRoutingGraph(graph: NetworkPathGraph): FabricSnapshot {
    const resources = new Map<string, FabricResource>(
      this.snapshot.resources.map((resource) => [resource.id, resource]),
    );
    const graphNodeIds = new Map(
      graph.nodes.map((node) => [node.id, fabricResourceIdFromPathNode(node)] as const),
    );

    for (const node of graph.nodes) {
      const resource = resourceFromPathNode(node);
      resources.set(resource.id, resource);
    }

    const edges = graph.edges.map((edge) => ({
      from: graphNodeIds.get(edge.from) ?? edge.from,
      to: graphNodeIds.get(edge.to) ?? edge.to,
      relation: edge.kind,
    }));

    this.snapshot = Object.freeze({
      ...this.snapshot,
      version: this.snapshot.version + 1,
      discoveredAt: nowIso(),
      resources: Object.freeze(
        [...resources.values()].sort((a, b) => a.id.localeCompare(b.id)),
      ),
      edges: Object.freeze(edges),
    });
    return this.snapshot;
  }
}

const kindForNode = (node: PathGraphNode): FabricResourceKind => {
  switch (node.kind) {
    case 'interface':
      return 'Interface';
    case 'route':
      return 'Route';
    case 'gateway':
      return 'Gateway';
    case 'provider':
      return 'Provider';
    case 'tunnel':
      return 'Tunnel';
    case 'transport':
      return 'Transport';
    case 'egress':
      return 'Egress';
    case 'region':
      return 'Region';
    case 'destination':
      return 'Destination';
    case 'path':
      return 'ApplicationPath';
  }
};

const resourceIdFromPathNode = (node: PathGraphNode): string =>
  node.id.includes(':') ? node.id.slice(node.id.indexOf(':') + 1) : node.id;

const fabricResourceIdFromPathNode = (node: PathGraphNode): string =>
  `fabric:${kindForNode(node).toLowerCase()}:${resourceIdFromPathNode(node)}`;

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
