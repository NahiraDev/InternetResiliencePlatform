import { describe, expect, it } from 'vitest';
import {
  ProgrammableConnectivityFabric,
  type FabricResource,
  type FabricDiscoveryProvider,
} from '../src/index.js';

describe('Phase 93 — Advanced Routing Control regressions', () => {
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
    failureDomains: [`domain-${id}`],
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

  it('ranks Route candidates by health, freshness, and diversity without side effects', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const best = makeRoute('route-best', {
      health: { status: 'healthy', score: 98, checkedAt: now },
      cost: { latencyMs: 8 },
      failureDomains: ['region-a'],
    });
    const good = makeRoute('route-good', {
      health: { status: 'healthy', score: 80, checkedAt: now },
      cost: { latencyMs: 25 },
      failureDomains: ['region-b'],
    });
    const stale = makeRoute('route-stale', {
      observedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      health: { status: 'healthy', score: 99, checkedAt: now },
    });

    const provider: FabricDiscoveryProvider = {
      id: 'advanced-routing',
      owner: 'routing-adapter',
      async discover() {
        return [best, good, stale];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    const result = fabric.select({ kind: 'Route', now });
    expect(result.selected?.id).toBe('route-best');
    expect(result.candidates).toHaveLength(2);
    expect(result.rejected.some((r) => r.id === 'route-stale' && r.reason === 'stale-resource')).toBe(
      true,
    );
    expect(result.diversity?.diverse.length).toBeGreaterThanOrEqual(1);
    // Pure: snapshot unchanged by select
    expect(fabric.snapshotState().resources).toHaveLength(3);
  });

  it('applies preferred failure-domain constraints deterministically (intent-like preference)', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const preferred = makeRoute('route-pref', {
      health: { status: 'healthy', score: 75, checkedAt: now },
      failureDomains: ['preferred-region'],
    });
    const other = makeRoute('route-other', {
      health: { status: 'healthy', score: 95, checkedAt: now },
      failureDomains: ['other-region'],
    });

    const provider: FabricDiscoveryProvider = {
      id: 'advanced-routing',
      owner: 'routing-adapter',
      async discover() {
        return [preferred, other];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    const result = fabric.select({
      kind: 'Route',
      preferredFailureDomains: ['preferred-region'],
      now,
    });
    expect(result.selected?.id).toBe('route-pref');
    expect(result.candidates[0]?.id).toBe('route-pref');
  });

  it('fails closed on insufficient diversity or stale candidates', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const same1 = makeRoute('route-same-1', { failureDomains: ['shared'] });
    const same2 = makeRoute('route-same-2', { failureDomains: ['shared'] });
    const stale = makeRoute('route-stale', {
      observedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    });

    const provider: FabricDiscoveryProvider = {
      id: 'advanced-routing',
      owner: 'routing-adapter',
      async discover() {
        return [same1, same2, stale];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    const result = fabric.select({
      kind: 'Route',
      minimumDiverseAlternatives: 2,
      now,
    });
    expect(result.selected).toBeUndefined();
    expect(
      result.rejected.some((r) => r.reason === 'insufficient-failure-domain-diversity'),
    ).toBe(true);
    expect(result.rejected.some((r) => r.id === 'route-stale' && r.reason === 'stale-resource')).toBe(
      true,
    );
  });

  it('keeps re-routing on the existing fabric.select boundary (no parallel authority)', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const primary = makeRoute('route-primary', {
      health: { status: 'healthy', score: 92, checkedAt: now },
      failureDomains: ['region-a'],
    });
    const alternate = makeRoute('route-alt', {
      health: { status: 'healthy', score: 70, checkedAt: now },
      failureDomains: ['region-b'],
    });

    const provider: FabricDiscoveryProvider = {
      id: 'advanced-routing',
      owner: 'routing-adapter',
      async discover() {
        return [primary, alternate];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    const first = fabric.select({ kind: 'Route', now });
    expect(first.selected?.id).toBe('route-primary');

    // Simulated condition change still uses the same select entrypoint
    const second = fabric.select({
      kind: 'Route',
      preferredFailureDomains: ['region-b'],
      now,
    });
    expect(second.selected?.id).toBe('route-alt');
    expect(second.reason).toBeTruthy();
  });
});
