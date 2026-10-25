import { describe, expect, it } from 'vitest';
import {
  ProgrammableConnectivityFabric,
  type FabricResource,
  type FabricDiscoveryProvider,
} from '../src/index.js';

describe('Phase 88 — Multi-Path Connectivity Management regressions', () => {
  const now = new Date().toISOString();
  const makeRoute = (
    id: string,
    overrides: Partial<FabricResource> = {},
  ): FabricResource => ({
    id,
    kind: 'Route',
    state: 'HEALTHY',
    health: { status: 'healthy', score: 90, checkedAt: now },
    confidence: 0.9,
    observedAt: now,
    trust: 0.85,
    capacity: { bandwidthMbps: 100 },
    cost: { latencyMs: 10 },
    owner: 'routing-adapter',
    failureDomains: [`path-${id}`],
    lifecycle: 'active',
    capabilities: [
      {
        id: 'route.select',
        scope: 'route',
        authority: 'runtime',
        trust: 0.9,
        safety: 'governed',
        platforms: ['linux'],
      },
    ],
    metadata: { protocol: 'static' },
    ...overrides,
  });

  it('selects among multiple healthy Route candidates preferring higher health', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const primary = makeRoute('path-primary', {
      health: { status: 'healthy', score: 95, checkedAt: now },
      failureDomains: ['nic-eth0'],
    });
    const backup = makeRoute('path-backup', {
      health: { status: 'healthy', score: 75, checkedAt: now },
      cost: { latencyMs: 30 },
      failureDomains: ['nic-wlan0'],
    });

    const provider: FabricDiscoveryProvider = {
      id: 'routing-paths',
      owner: 'routing-adapter',
      async discover() {
        return [primary, backup];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    const result = fabric.select({ kind: 'Route', now });
    expect(result.selected?.id).toBe('path-primary');
    expect(result.candidates).toHaveLength(2);
    expect(result.diversity?.diverse.length).toBeGreaterThanOrEqual(1);
    expect(result.reason).toBeTruthy();
  });

  it('filters stale Route resources from selection', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const fresh = makeRoute('path-fresh');
    const stale = makeRoute('path-stale', {
      observedAt: new Date(Date.now() - 180_000).toISOString(),
      expiresAt: new Date(Date.now() - 90_000).toISOString(),
    });

    const provider: FabricDiscoveryProvider = {
      id: 'routing-paths',
      owner: 'routing-adapter',
      async discover() {
        return [fresh, stale];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    const result = fabric.select({ kind: 'Route', now });
    expect(result.selected?.id).toBe('path-fresh');
    expect(result.candidates).toHaveLength(1);
    expect(result.rejected.some((r) => r.id === 'path-stale' && r.reason === 'stale-resource')).toBe(
      true,
    );
  });

  it('supports diversity preference via failure domains and fails closed when required diversity is unmet', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const sameDomain1 = makeRoute('path-a', { failureDomains: ['shared-nic'] });
    const sameDomain2 = makeRoute('path-b', { failureDomains: ['shared-nic'] });

    const provider: FabricDiscoveryProvider = {
      id: 'routing-paths',
      owner: 'routing-adapter',
      async discover() {
        return [sameDomain1, sameDomain2];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    const result = fabric.select({
      kind: 'Route',
      minimumDiverseAlternatives: 2,
      now,
    });
    // Shared failure domain means diversity shortfall; selection must fail closed
    expect(result.selected).toBeUndefined();
    expect(result.rejected.some((r) => r.reason === 'insufficient-failure-domain-diversity')).toBe(
      true,
    );
  });

  it('exposes ApplicationPath kind for multi-path candidates', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const appPath = makeRoute('app-path-1', { kind: 'ApplicationPath' });

    const provider: FabricDiscoveryProvider = {
      id: 'app-paths',
      owner: 'routing-adapter',
      async discover() {
        return [appPath];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    const result = fabric.select({ kind: 'ApplicationPath', now });
    expect(result.selected?.id).toBe('app-path-1');
    expect(result.selected?.kind).toBe('ApplicationPath');
  });
});
