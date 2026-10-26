import { describe, expect, it } from 'vitest';
import {
  ProgrammableConnectivityFabric,
  type FabricResource,
  type FabricDiscoveryProvider,
  type FabricResourceKind,
} from '../src/index.js';

describe('Phase 91 — Application-Aware Path Selection regressions', () => {
  const now = new Date().toISOString();

  const makeResource = (
    kind: FabricResourceKind,
    id: string,
    overrides: Partial<FabricResource> = {},
  ): FabricResource => ({
    id,
    kind,
    state: 'HEALTHY',
    health: { status: 'healthy', score: 90, checkedAt: now },
    confidence: 0.9,
    observedAt: now,
    trust: 0.85,
    capacity: { bandwidthMbps: 100 },
    cost: { latencyMs: 10 },
    owner: `${kind.toLowerCase()}-adapter`,
    failureDomains: [`${kind.toLowerCase()}-${id}`],
    lifecycle: 'active',
    capabilities: [
      {
        id: `${kind.toLowerCase()}.select`,
        scope: kind.toLowerCase(),
        authority: 'runtime',
        trust: 0.9,
        safety: 'governed',
        platforms: ['linux'],
      },
    ],
    metadata: { region: 'ir-central', application: 'web' },
    ...overrides,
  });

  const kinds: FabricResourceKind[] = ['ApplicationPath', 'Service', 'Endpoint'];

  for (const kind of kinds) {
    describe(`${kind} resource`, () => {
      it(`selects among multiple healthy ${kind} candidates preferring higher health`, async () => {
        const fabric = new ProgrammableConnectivityFabric();
        const primary = makeResource(kind, `${kind.toLowerCase()}-primary`, {
          health: { status: 'healthy', score: 95, checkedAt: now },
          failureDomains: ['region-a'],
          metadata: { application: 'api', region: 'ir-central' },
        });
        const backup = makeResource(kind, `${kind.toLowerCase()}-backup`, {
          health: { status: 'healthy', score: 75, checkedAt: now },
          cost: { latencyMs: 30 },
          failureDomains: ['region-b'],
          metadata: { application: 'api', region: 'ir-central' },
        });

        const provider: FabricDiscoveryProvider = {
          id: `${kind.toLowerCase()}-sources`,
          owner: `${kind.toLowerCase()}-adapter`,
          async discover() {
            return [primary, backup];
          },
        };
        fabric.registerProvider(provider);
        await fabric.discover();

        const result = fabric.select({ kind, now });
        expect(result.selected?.id).toBe(`${kind.toLowerCase()}-primary`);
        expect(result.candidates).toHaveLength(2);
        expect(result.diversity?.diverse.length).toBeGreaterThanOrEqual(1);
        expect(result.reason).toBeTruthy();
      });

      it(`filters stale ${kind} candidates`, async () => {
        const fabric = new ProgrammableConnectivityFabric();
        const stale = makeResource(kind, `${kind.toLowerCase()}-stale`, {
          observedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          health: { status: 'healthy', score: 90, checkedAt: now },
        });
        const fresh = makeResource(kind, `${kind.toLowerCase()}-fresh`, {
          health: { status: 'healthy', score: 80, checkedAt: now },
        });

        const provider: FabricDiscoveryProvider = {
          id: `${kind.toLowerCase()}-sources`,
          owner: `${kind.toLowerCase()}-adapter`,
          async discover() {
            return [stale, fresh];
          },
        };
        fabric.registerProvider(provider);
        await fabric.discover();

        const result = fabric.select({ kind, now, maxAgeMs: 30 * 60 * 1000 });
        expect(result.selected?.id).toBe(`${kind.toLowerCase()}-fresh`);
        expect(result.candidates).toHaveLength(1);
        expect(
          result.rejected.some(
            (r) => r.id === `${kind.toLowerCase()}-stale` && r.reason === 'stale-resource',
          ),
        ).toBe(true);
      });

      it(`supports diversity preference for ${kind} and fails closed when required diversity is unmet`, async () => {
        const fabric = new ProgrammableConnectivityFabric();
        const sameDomain1 = makeResource(kind, `${kind.toLowerCase()}-a`, {
          failureDomains: ['shared-region'],
          metadata: { application: 'critical' },
        });
        const sameDomain2 = makeResource(kind, `${kind.toLowerCase()}-b`, {
          failureDomains: ['shared-region'],
          metadata: { application: 'critical' },
        });

        const provider: FabricDiscoveryProvider = {
          id: `${kind.toLowerCase()}-sources`,
          owner: `${kind.toLowerCase()}-adapter`,
          async discover() {
            return [sameDomain1, sameDomain2];
          },
        };
        fabric.registerProvider(provider);
        await fabric.discover();

        const result = fabric.select({
          kind,
          minimumDiverseAlternatives: 2,
          now,
        });
        expect(result.selected).toBeUndefined();
        expect(
          result.rejected.some((r) => r.reason === 'insufficient-failure-domain-diversity'),
        ).toBe(true);
      });

      it(`exposes ${kind} inventory attributes including ownership, failure domains and application metadata`, async () => {
        const fabric = new ProgrammableConnectivityFabric();
        const resource = makeResource(kind, `${kind.toLowerCase()}-inventory`, {
          owner: 'control-plane',
          failureDomains: ['az-1', 'provider-x'],
          metadata: { application: 'web-app', service: 'api-gateway' },
        });

        const provider: FabricDiscoveryProvider = {
          id: `${kind.toLowerCase()}-inventory`,
          owner: `${kind.toLowerCase()}-adapter`,
          async discover() {
            return [resource];
          },
        };
        fabric.registerProvider(provider);
        await fabric.discover();

        const snapshot = fabric.snapshotState();
        const found = snapshot.resources.find((r) => r.id === `${kind.toLowerCase()}-inventory`);
        expect(found).toBeDefined();
        expect(found?.kind).toBe(kind);
        expect(found?.owner).toBe('control-plane');
        expect(found?.failureDomains).toEqual(['az-1', 'provider-x']);
        expect(found?.health.status).toBe('healthy');
        expect(found?.metadata?.application).toBe('web-app');
      });
    });
  }
});
