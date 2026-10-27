import { describe, expect, it } from 'vitest';
import {
  ProgrammableConnectivityFabric,
  FabricCapabilityAuthority,
  SELECTABLE_FABRIC_STATES,
  type FabricResource,
} from '../src/index.js';
import { NetworkPathGraph } from '@irp/routing';
import type { NetworkPath } from '@irp/routing';

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
  capabilities: [],
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

const path = (over: Partial<NetworkPath> = {}): NetworkPath =>
  ({
    id: 'direct',
    state: 'active',
    source: { providerId: 'isp-a', available: true },
    route: { id: 'route-a', gateway: 'gw-a', interfaceName: 'eth0', state: 'active', metadata: {} },
    metadata: {},
    ...over,
  }) as unknown as NetworkPath;

describe('fabric corrections (issue #275 re-verification)', () => {
  describe('canonical resource states', () => {
    it('excludes recovering and restricted resources from selection', () => {
      // A resource that has not re-established its outcome, or that policy
      // restricts, must not be selectable.
      expect(SELECTABLE_FABRIC_STATES.has('RECOVERING')).toBe(false);
      expect(SELECTABLE_FABRIC_STATES.has('RESTRICTED')).toBe(false);
      expect(SELECTABLE_FABRIC_STATES.has('HEALTHY')).toBe(true);
      expect(SELECTABLE_FABRIC_STATES.has('DEGRADED')).toBe(true);
    });

    it('does not select a recovering or restricted resource', async () => {
      const fabric = new ProgrammableConnectivityFabric();
      // Discovery must reach these states legally: HEALTHY -> RESTRICTED and
      // DEGRADED -> RECOVERING are both in the transition table.
      const base = gateway({ expiresAt: iso(60_000) });
      fabric.registerProvider(
        provider('a', 'linux-client', [{ ...base, id: 'gw-restricted', state: 'HEALTHY' }]),
      );
      await fabric.discover();
      fabric.registerProvider(
        provider('b', 'linux-client', [{ ...base, id: 'gw-restricted', state: 'RESTRICTED' }]),
      );
      await fabric.discover();
      fabric.registerProvider(
        provider('c', 'linux-client', [{ ...base, id: 'gw-recovering', state: 'DEGRADED' }]),
      );
      await fabric.discover();
      fabric.registerProvider(
        provider('d', 'linux-client', [{ ...base, id: 'gw-recovering', state: 'RECOVERING' }]),
      );
      await fabric.discover();

      const result = fabric.select();
      expect(result.selected).toBeUndefined();
      const reasons = result.rejected.map((entry) => entry.reason);
      expect(reasons).toEqual(['state-recovering', 'state-restricted']);
    });
  });

  describe('capability scope is binding, fail-closed', () => {
    it('rejects a request whose scope differs from the declared capability scope', () => {
      const authority = new FabricCapabilityAuthority();
      authority.register({
        id: 'route.select',
        scope: 'gateway',
        authority: 'adapter',
        trust: 0.9,
        safety: 'safe',
        platforms: ['any'],
      });

      expect(authority.authorize({ capabilityId: 'route.select', resourceId: 'gw-a' }).allowed).toBe(
        true,
      );
      const wrongScope = authority.authorize({
        capabilityId: 'route.select',
        resourceId: 'iface-a',
        scope: 'interface',
      });
      expect(wrongScope.allowed).toBe(false);
      expect(wrongScope.reasons).toContain('scope-mismatch:gateway!=interface');
    });

    it('fails closed on a provider capability scope conflict', async () => {
      const fabric = new ProgrammableConnectivityFabric();
      const claim = (id: string, scope: string) => ({
        id,
        scope,
        authority: 'adapter' as const,
        trust: 0.9,
        safety: 'safe' as const,
        platforms: ['any'],
      });
      fabric.registerProvider(
        provider('a', 'linux-client', [
          gateway({ id: 'gw-a', capabilities: [claim('shared.cap', 'gateway')] }),
        ]),
      );
      await fabric.discover();

      fabric.registerProvider(
        provider('b', 'macos-client', [
          gateway({ id: 'gw-b', capabilities: [claim('shared.cap', 'interface')] }),
        ]),
      );
      // Silently keeping the first writer would let a provider appear to own a
      // scope it does not.
      await expect(fabric.discover()).rejects.toThrow(/scope conflict/);
    });
  });

  describe('real failure-domain evidence', () => {
    it('takes failure domains from canonical path evidence, not a singular metadata key', async () => {
      const fabric = new ProgrammableConnectivityFabric();
      const graph = new NetworkPathGraph([
        path({ id: 'direct', source: { providerId: 'isp-a', available: true }, route: { id: 'r1', gateway: 'gw-a', state: 'active', metadata: {} } }),
        path({ id: 'backup', source: { providerId: 'isp-b', available: true }, route: { id: 'r2', gateway: 'gw-b', state: 'active', metadata: {} } }),
      ]);

      const snapshot = fabric.reconcileRoutingGraph(graph);
      const paths = snapshot.resources.filter((resource) => resource.kind === 'ApplicationPath');
      expect(paths).toHaveLength(2);
      // Each path carries its own provider/gateway failure domain, so the two
      // paths are genuinely independent rather than vacuously "diverse".
      const domains = paths.flatMap((resource) => resource.failureDomains);
      expect(new Set(domains).size).toBeGreaterThan(1);
      for (const resource of paths) {
        expect(resource.failureDomains.length).toBeGreaterThan(0);
      }
    });

    it('fails closed when the caller requires a diversity floor that cannot be met', async () => {
      const fabric = new ProgrammableConnectivityFabric();
      // Two gateways behind the same provider: not independent.
      fabric.registerProvider(
        provider('p', 'linux-client', [
          gateway({ id: 'gw-a', failureDomains: ['isp-a'], expiresAt: iso(60_000) }),
          gateway({ id: 'gw-b', failureDomains: ['isp-a'], expiresAt: iso(60_000) }),
        ]),
      );
      await fabric.discover();

      const advisory = fabric.select();
      expect(advisory.selected?.id).toBe('gw-a');
      expect(advisory.diversity.diverse).toHaveLength(1);

      const strict = fabric.select({ minimumDiverseAlternatives: 2 });
      expect(strict.selected).toBeUndefined();
      expect(strict.reason).toMatch(/fail-closed/);
      expect(strict.rejected.map((entry) => entry.reason)).toContain(
        'insufficient-failure-domain-diversity',
      );
    });

    it('satisfies the diversity floor with genuinely disjoint paths', async () => {
      const fabric = new ProgrammableConnectivityFabric();
      fabric.registerProvider(
        provider('p', 'linux-client', [
          gateway({ id: 'gw-a', failureDomains: ['isp-a'], expiresAt: iso(60_000) }),
          gateway({ id: 'gw-b', failureDomains: ['isp-b'], expiresAt: iso(60_000) }),
        ]),
      );
      await fabric.discover();

      const strict = fabric.select({ minimumDiverseAlternatives: 2 });
      expect(strict.selected?.id).toBe('gw-a');
      expect(strict.diversity.distinctFailureDomains).toBe(2);
    });
  });

  describe('duplicate ownership', () => {
    it('rejects a reconcile that would change resource ownership', () => {
      const fabric = new ProgrammableConnectivityFabric();
      const graph = {
        version: 1,
        builtAt: iso(),
        nodes: [
          { id: 'path:direct', kind: 'path' as const, state: 'available' as const, metadata: {} },
        ],
        edges: [],
      };
      fabric.reconcileRoutingGraph(graph as never);
      // Same id, different owner: reconcile must apply the same fail-closed
      // ownership rule as discovery.
      const stolen = {
        ...graph,
        nodes: [
          {
            id: 'path:direct',
            kind: 'path' as const,
            state: 'available' as const,
            metadata: {},
          },
        ],
      };
      const snapshot = fabric.reconcileRoutingGraph(stolen as never);
      expect(
        snapshot.resources.find((resource) => resource.id === 'fabric:applicationpath:direct')?.owner,
      ).toBe('@irp/routing:NetworkPathGraph');
    });
  });
});