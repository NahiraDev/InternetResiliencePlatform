import { describe, expect, it } from 'vitest';
import {
  ProgrammableConnectivityFabric,
  FabricCapabilityAuthority,
  assertFabricStateTransition,
  isLegalFabricTransition,
  IllegalFabricStateTransitionError,

  partitionByFreshness,
  sharesFailureDomain,
  selectDiverseResources,
  countDistinctFailureDomains,
  FABRIC_RESOURCE_KINDS,
  FABRIC_RESOURCE_STATES,
  FABRIC_STATE_TRANSITIONS,
  type FabricResource,
} from '../src/index.js';

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

const gateway = (over: Partial<FabricResource> = {}): FabricResource => ({
  id: 'gw-default',
  kind: 'Gateway',
  state: 'HEALTHY',
  health: { status: 'healthy', score: 90, checkedAt: iso() },
  confidence: 0.9,
  observedAt: iso(),
  trust: 0.9,
  capacity: {},
  cost: { unit: 1 },
  owner: 'linux-client',
  failureDomains: ['isp-a'],
  lifecycle: 'active',
  capabilities: [
    {
      id: 'route.select',
      scope: 'gateway',
      authority: 'adapter',
      trust: 0.9,
      safety: 'safe',
      platforms: ['linux', 'any'],
    },
  ],
  metadata: {},
  ...over,
});

const provider = (id: string, owner: string, resources: FabricResource[]) => ({
  id,
  owner,
  async discover() {
    return resources;
  },
});

describe('Issue #275: Programmable Connectivity Fabric, Resources & Capabilities', () => {
  describe('task 1+3: canonical kinds and states', () => {
    it('canonicalizes all 17 resource kinds from the workstream', () => {
      expect(FABRIC_RESOURCE_KINDS).toEqual([
        'Device', 'Interface', 'Link', 'Provider', 'Gateway', 'Route', 'Resolver',
        'Tunnel', 'Transport', 'Proxy', 'Egress', 'RemoteNode', 'Region',
        'Destination', 'Service', 'Endpoint', 'ApplicationPath',
      ]);
      expect(FABRIC_RESOURCE_KINDS).toHaveLength(17);
    });

    it('canonicalizes all 11 resource states from the workstream', () => {
      expect(FABRIC_RESOURCE_STATES).toEqual([
        'UNKNOWN', 'DISCOVERING', 'HEALTHY', 'DEGRADED', 'FAILED', 'BLOCKED',
        'RESTRICTED', 'RECOVERING', 'QUARANTINED', 'DRAINING', 'UNAVAILABLE',
      ]);
      expect(FABRIC_RESOURCE_STATES).toHaveLength(11);
    });
  });

  describe('task 2: unified identity/state/health/confidence/freshness/trust/attributes', () => {
    it('carries the full unified attribute surface on every resource', () => {
      const resource = gateway();
      for (const attribute of [
        'id', 'kind', 'state', 'health', 'confidence', 'observedAt', 'trust',
        'capacity', 'cost', 'owner', 'failureDomains', 'lifecycle', 'capabilities',
      ]) {
        expect(resource, `missing ${attribute}`).toHaveProperty(attribute);
      }
      expect(resource.owner).toBe('linux-client');
      expect(resource.lifecycle).toBe('active');
    });
  });

  describe('task 3 (cont): explicit resource state machine', () => {
    it('allows recovery-flavoured transitions', () => {
      expect(isLegalFabricTransition('HEALTHY', 'DEGRADED')).toBe(true);
      expect(isLegalFabricTransition('FAILED', 'RECOVERING')).toBe(true);
      expect(isLegalFabricTransition('RECOVERING', 'HEALTHY')).toBe(true);
      expect(isLegalFabricTransition('DRAINING', 'UNAVAILABLE')).toBe(true);
    });

    it('forbids skipping recovery (FAILED cannot become HEALTHY directly)', () => {
      expect(isLegalFabricTransition('FAILED', 'HEALTHY')).toBe(false);
      expect(isLegalFabricTransition('QUARANTINED', 'HEALTHY')).toBe(false);
      expect(isLegalFabricTransition('UNAVAILABLE', 'HEALTHY')).toBe(false);
      expect(() => assertFabricStateTransition('FAILED', 'HEALTHY')).toThrow(
        IllegalFabricStateTransitionError,
      );
    });

    it('defines transitions for every canonical state', () => {
      for (const state of FABRIC_RESOURCE_STATES) {
        expect(FABRIC_STATE_TRANSITIONS[state], `missing transitions for ${state}`).toBeDefined();
      }
    });
  });

  describe('task 4: bounded/cancellable/incremental/freshness-aware discovery', () => {
    it('enforces the discovery bound', async () => {
      const fabric = new ProgrammableConnectivityFabric();
      fabric.registerProvider(
        provider('bulk', 'linux-client', [
          gateway({ id: 'gw-1' }),
          gateway({ id: 'gw-2' }),
          gateway({ id: 'gw-3' }),
        ]),
      );
      const snapshot = await fabric.discover({ limit: 2 });
      expect(snapshot.resources).toHaveLength(2);
    });

    it('supports cancellation', async () => {
      const fabric = new ProgrammableConnectivityFabric();
      const controller = new AbortController();
      fabric.registerProvider({
        id: 'slow',
        owner: 'linux-client',
        async discover() {
          controller.abort();
          return [gateway()];
        },
      });
      await expect(fabric.discover({ signal: controller.signal })).rejects.toThrow(/aborted/i);
    });

    it('supports incremental discovery via since', async () => {
      const fabric = new ProgrammableConnectivityFabric();
      let incremental = false;
      fabric.registerProvider({
        id: 'inc',
        owner: 'linux-client',
        async discover(context) {
          if (context.since && incremental) return [gateway({ id: 'gw-2' })];
          return [gateway({ id: 'gw-1' })];
        },
      });
      await fabric.discover();
      expect(fabric.snapshotState().resources).toHaveLength(1);
      incremental = true;
      const snapshot = await fabric.discover({ since: iso(-1_000) });
      expect(snapshot.resources.map((r) => r.id).sort()).toEqual(['gw-1', 'gw-2']);
    });

    it('reports freshness and rejects expired evidence at selection time', async () => {
      const fabric = new ProgrammableConnectivityFabric();
      fabric.registerProvider(
        provider('p', 'linux-client', [
          gateway({ id: 'gw-live' }),
          gateway({ id: 'gw-expired', expiresAt: iso(-5_000) }),
        ]),
      );
      await fabric.discover();
      const report = fabric.freshnessReport();
      expect(report.find((r) => r.resourceId === 'gw-expired')?.fresh).toBe(false);
      expect(report.find((r) => r.resourceId === 'gw-live')?.fresh).toBe(true);

      const selection = fabric.select();
      expect(selection.selected?.id).toBe('gw-live');
      expect(selection.rejected).toContainEqual({ id: 'gw-expired', reason: 'stale-resource' });
    });

    it('compacts expired evidence only when explicitly asked', async () => {
      const fabric = new ProgrammableConnectivityFabric();
      fabric.registerProvider(
        provider('p', 'linux-client', [
          gateway({ id: 'gw-live' }),
          gateway({ id: 'gw-expired', expiresAt: iso(-5_000) }),
        ]),
      );
      await fabric.discover();
      expect(fabric.snapshotState().resources).toHaveLength(2);
      const pruned = fabric.pruneExpired();
      expect(pruned.resources.map((r) => r.id)).toEqual(['gw-live']);
    });

    it('partitions resources by freshness', () => {
      const { fresh, stale } = partitionByFreshness(
        [gateway({ id: 'a' }), gateway({ id: 'b', expiresAt: iso(-1_000) })],
        iso(),
      );
      expect(fresh.map((r) => r.id)).toEqual(['a']);
      expect(stale.map((r) => r.id)).toEqual(['b']);
    });
  });

  describe('task 5: unified capability registry with scope/authority/trust/safety/platform', () => {
    it('authorizes by scope, trust, safety and platform', () => {
      const authority = new FabricCapabilityAuthority();
      authority.register({
        id: 'gateway.select',
        scope: 'gateway',
        authority: 'runtime',
        trust: 0.9,
        safety: 'governed',
        platforms: ['linux'],
      });

      expect(
        authority.authorize({ capabilityId: 'gateway.select', resourceId: 'gw-1', platform: 'linux' })
          .allowed,
      ).toBe(true);

      const wrongPlatform = authority.authorize({
        capabilityId: 'gateway.select',
        resourceId: 'gw-1',
        platform: 'windows',
      });
      expect(wrongPlatform.allowed).toBe(false);
      expect(wrongPlatform.reasons.join()).toMatch(/platform-unsupported/);

      const tooTrusted = authority.authorize({
        capabilityId: 'gateway.select',
        resourceId: 'gw-1',
        minimumTrust: 0.95,
      });
      expect(tooTrusted.allowed).toBe(false);
      expect(tooTrusted.reasons.join()).toMatch(/insufficient-trust/);

      const unsafe = authority.authorize({
        capabilityId: 'gateway.select',
        resourceId: 'gw-1',
        maximumSafety: 'read-only',
      });
      expect(unsafe.allowed).toBe(false);
      expect(unsafe.reasons.join()).toMatch(/safety-exceeds-ceiling/);

      const notRuntime = authority.authorize({
        capabilityId: 'gateway.select',
        resourceId: 'gw-1',
        requireRuntimeAuthority: true,
      });
      expect(notRuntime.allowed).toBe(true);

      // A provider-authority capability must be refused when the caller
      // requires runtime authority.
      authority.register({
        id: 'gateway.advise',
        scope: 'gateway-advisory',
        authority: 'provider',
        trust: 0.9,
        safety: 'read-only',
        platforms: ['any'],
      });
      const providerAuthority = authority.authorize({
        capabilityId: 'gateway.advise',
        resourceId: 'gw-1',
        requireRuntimeAuthority: true,
      });
      expect(providerAuthority.allowed).toBe(false);
      expect(providerAuthority.reasons.join()).toMatch(/authority-insufficient/);
    });

    it('denies unregistered capabilities', () => {
      const authority = new FabricCapabilityAuthority();
      expect(authority.authorize({ capabilityId: 'nope', resourceId: 'x' }).allowed).toBe(false);
    });

    it('rejects duplicate ids and scope collisions', () => {
      const authority = new FabricCapabilityAuthority();
      authority.register({
        id: 'a.one', scope: 'gateway', authority: 'adapter', trust: 0.5,
        safety: 'safe', platforms: ['any'],
      });
      expect(() =>
        authority.register({
          id: 'a.one', scope: 'other', authority: 'adapter', trust: 0.5,
          safety: 'safe', platforms: ['any'],
        }),
      ).toThrow(/already registered/);
      expect(() =>
        authority.register({
          id: 'a.two', scope: 'gateway', authority: 'adapter', trust: 0.5,
          safety: 'safe', platforms: ['any'],
        }),
      ).toThrow(/already claimed/);
    });

    it('is enforced by selection, not just declared', async () => {
      const fabric = new ProgrammableConnectivityFabric();
      fabric.registerProvider(
        provider('p', 'linux-client', [
          gateway({
            id: 'gw-linux',
            capabilities: [{
              id: 'linux.only', scope: 'gateway', authority: 'adapter', trust: 0.9,
              safety: 'safe', platforms: ['linux'],
            }],
          }),
        ]),
      );
      await fabric.discover();

      const linux = fabric.select({ requiredCapabilities: ['linux.only'], platform: 'linux' });
      expect(linux.selected?.id).toBe('gw-linux');
      expect(linux.capabilityDecisions?.[0]?.allowed).toBe(true);

      const windows = fabric.select({ requiredCapabilities: ['linux.only'], platform: 'windows' });
      expect(windows.selected).toBeUndefined();
      expect(windows.rejected[0]?.reason).toMatch(/capability-denied/);
    });
  });

  describe('task 7: true failure-domain diversity', () => {
    it('detects shared failure domains', () => {
      expect(sharesFailureDomain(gateway({ id: 'a', failureDomains: ['isp-a'] }), gateway({ id: 'b', failureDomains: ['isp-a'] }))).toBe(true);
      expect(sharesFailureDomain(gateway({ id: 'a', failureDomains: ['isp-a'] }), gateway({ id: 'b', failureDomains: ['isp-b'] }))).toBe(false);
    });

    it('selects mutually disjoint candidates and reports fallbacks', () => {
      const ranked = [
        gateway({ id: 'a', failureDomains: ['isp-a'], health: { status: 'healthy', score: 95, checkedAt: iso() } }),
        gateway({ id: 'b', failureDomains: ['isp-a'], health: { status: 'healthy', score: 94, checkedAt: iso() } }),
        gateway({ id: 'c', failureDomains: ['isp-c'], health: { status: 'healthy', score: 93, checkedAt: iso() } }),
      ];
      const diversity = selectDiverseResources(ranked, { required: 2 });
      expect(diversity.diverse.map((r) => r.id)).toEqual(['a', 'c']);
      expect(diversity.fallback.map((r) => r.id)).toEqual(['b']);
      expect(diversity.reason).toMatch(/disjoint/);
    });

    it('counts distinct failure domains', () => {
      expect(
        countDistinctFailureDomains([
          gateway({ id: 'a', failureDomains: ['isp-a', 'metro-1'] }),
          gateway({ id: 'b', failureDomains: ['isp-b'] }),
        ]),
      ).toBe(3);
    });

    it('surfaces diversity evidence through selection', async () => {
      const fabric = new ProgrammableConnectivityFabric();
      fabric.registerProvider(
        provider('p', 'linux-client', [
          gateway({ id: 'gw-a', failureDomains: ['isp-a'] }),
          gateway({ id: 'gw-b', failureDomains: ['isp-a'] }),
          gateway({ id: 'gw-c', failureDomains: ['isp-c'] }),
        ]),
      );
      await fabric.discover();
      const selection = fabric.select({ minimumDiverseAlternatives: 2 });
      expect(selection.diversity?.diverse.length).toBeGreaterThanOrEqual(2);
      expect(selection.diversity?.diverse.map((r) => r.id)).not.toContain('gw-b');
    });
  });

  describe('task 8: explicit non-duplicated ownership', () => {
    it('exposes an ownership index and per-owner lookup', async () => {
      const fabric = new ProgrammableConnectivityFabric();
      fabric.registerProvider(
        provider('p', 'linux-client', [gateway({ id: 'gw-1' }), gateway({ id: 'gw-2' })]),
      );
      await fabric.discover();
      expect(fabric.ownershipIndex()).toEqual({ 'gw-1': 'linux-client', 'gw-2': 'linux-client' });
      expect(fabric.resourcesOwnedBy('linux-client').map((r) => r.id)).toEqual(['gw-1', 'gw-2']);
      expect(fabric.resourcesOwnedBy('other')).toEqual([]);
    });

    it('rejects conflicting ownership for the same resource id', async () => {
      const fabric = new ProgrammableConnectivityFabric();
      fabric.registerProvider(provider('a', 'owner-a', [gateway({ id: 'dup', owner: 'owner-a' })]));
      fabric.registerProvider(provider('b', 'owner-b', [gateway({ id: 'dup', owner: 'owner-b' })]));
      await expect(fabric.discover()).rejects.toThrow(/duplicate fabric ownership/);
    });
  });

  describe('task 6: NetworkPathGraph reconciliation', () => {
    it('reconciles routing path nodes into fabric identity space', async () => {
      const fabric = new ProgrammableConnectivityFabric();
      const graph = {
        version: 1,
        builtAt: iso(),
        nodes: [
          {
            id: 'path:direct',
            kind: 'path' as const,
            state: 'active' as const,
            metadata: { failureDomain: 'isp-a' },
          },
        ],
        edges: [],
      };
      const snapshot = fabric.reconcileRoutingGraph(graph);
      const reconciled = snapshot.resources.find((r) => r.kind === 'ApplicationPath');
      expect(reconciled?.id).toBe('fabric:applicationpath:direct');
      expect(reconciled?.owner).toBe('@irp/routing:NetworkPathGraph');
    });
  });
});
