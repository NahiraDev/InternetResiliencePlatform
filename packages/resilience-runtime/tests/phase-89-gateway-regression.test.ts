import { describe, expect, it } from 'vitest';
import {
  ProgrammableConnectivityFabric,
  type FabricResource,
  type FabricDiscoveryProvider,
} from '../src/index.js';

describe('Phase 89 — Gateway Intelligence & Selection regressions', () => {
  const now = new Date().toISOString();
  const makeGateway = (
    id: string,
    overrides: Partial<FabricResource> = {},
  ): FabricResource => ({
    id,
    kind: 'Gateway',
    state: 'HEALTHY',
    health: { status: 'healthy', score: 90, checkedAt: now },
    confidence: 0.9,
    observedAt: now,
    trust: 0.85,
    capacity: { bandwidthMbps: 100 },
    cost: { latencyMs: 10 },
    owner: 'gateway-adapter',
    failureDomains: [`gw-${id}`],
    lifecycle: 'active',
    capabilities: [
      {
        id: 'gateway.select',
        scope: 'gateway',
        authority: 'runtime',
        trust: 0.9,
        safety: 'governed',
        platforms: ['linux'],
      },
    ],
    metadata: { region: 'ir-central' },
    ...overrides,
  });

  it('selects among multiple healthy Gateway candidates preferring higher health', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const primary = makeGateway('gw-primary', {
      health: { status: 'healthy', score: 95, checkedAt: now },
      failureDomains: ['region-a'],
    });
    const backup = makeGateway('gw-backup', {
      health: { status: 'healthy', score: 75, checkedAt: now },
      cost: { latencyMs: 30 },
      failureDomains: ['region-b'],
    });

    const provider: FabricDiscoveryProvider = {
      id: 'gateway-sources',
      owner: 'gateway-adapter',
      async discover() {
        return [primary, backup];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    const result = fabric.select({ kind: 'Gateway', now });
    expect(result.selected?.id).toBe('gw-primary');
    expect(result.candidates).toHaveLength(2);
    expect(result.diversity?.diverse.length).toBeGreaterThanOrEqual(1);
    expect(result.reason).toBeTruthy();
  });

  it('filters stale Gateway resources from selection', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const fresh = makeGateway('gw-fresh');
    const stale = makeGateway('gw-stale', {
      observedAt: new Date(Date.now() - 180_000).toISOString(),
      expiresAt: new Date(Date.now() - 90_000).toISOString(),
    });

    const provider: FabricDiscoveryProvider = {
      id: 'gateway-sources',
      owner: 'gateway-adapter',
      async discover() {
        return [fresh, stale];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    const result = fabric.select({ kind: 'Gateway', now });
    expect(result.selected?.id).toBe('gw-fresh');
    expect(result.candidates).toHaveLength(1);
    expect(result.rejected.some((r) => r.id === 'gw-stale' && r.reason === 'stale-resource')).toBe(
      true,
    );
  });

  it('supports diversity preference via failure domains and fails closed when required diversity is unmet', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const sameDomain1 = makeGateway('gw-a', { failureDomains: ['shared-region'] });
    const sameDomain2 = makeGateway('gw-b', { failureDomains: ['shared-region'] });

    const provider: FabricDiscoveryProvider = {
      id: 'gateway-sources',
      owner: 'gateway-adapter',
      async discover() {
        return [sameDomain1, sameDomain2];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    const result = fabric.select({
      kind: 'Gateway',
      minimumDiverseAlternatives: 2,
      now,
    });
    // Shared failure domain means diversity shortfall; selection must fail closed
    expect(result.selected).toBeUndefined();
    expect(result.rejected.some((r) => r.reason === 'insufficient-failure-domain-diversity')).toBe(
      true,
    );
  });

  it('exposes Gateway inventory attributes including ownership and failure domains', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const gw = makeGateway('gw-inventory', {
      owner: 'control-plane',
      failureDomains: ['az-1', 'provider-x'],
    });

    const provider: FabricDiscoveryProvider = {
      id: 'gateway-inventory',
      owner: 'gateway-adapter',
      async discover() {
        return [gw];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    const snapshot = fabric.snapshotState();
    const resource = snapshot.resources.find((r) => r.id === 'gw-inventory');
    expect(resource).toBeDefined();
    expect(resource?.kind).toBe('Gateway');
    expect(resource?.owner).toBe('control-plane');
    expect(resource?.failureDomains).toEqual(['az-1', 'provider-x']);
    expect(resource?.health.status).toBe('healthy');
  });
});
