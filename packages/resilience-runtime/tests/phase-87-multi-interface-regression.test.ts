import { describe, expect, it } from 'vitest';
import {
  ProgrammableConnectivityFabric,
  type FabricResource,
  evaluateFabricFreshness,
} from '../src/index.js';

describe('Phase 87 — Multi-Interface Intelligence regressions', () => {
  const now = new Date().toISOString();
  const makeInterface = (id: string, overrides: Partial<FabricResource> = {}): FabricResource => ({
    id,
    kind: 'Interface',
    state: 'HEALTHY',
    health: { status: 'healthy', score: 85, checkedAt: now },
    confidence: 0.85,
    observedAt: new Date(Date.now() - 10_000).toISOString(),
    trust: 0.9,
    capacity: { bandwidth: 100 },
    cost: { latency: 20 },
    owner: 'device',
    failureDomains: ['local'],
    lifecycle: 'active',
    capabilities: [],
    metadata: { media: 'ethernet' },
    ...overrides,
  });

  it('selects the highest-health fresh Interface and rejects non-Interface kinds', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const wifi = makeInterface('wifi-1', {
      health: { status: 'healthy', score: 70, checkedAt: now },
      metadata: { media: 'wifi' },
    });
    const eth = makeInterface('eth-1', {
      health: { status: 'healthy', score: 95, checkedAt: now },
      metadata: { media: 'ethernet' },
    });
    const gateway = {
      ...makeInterface('gw-1'),
      kind: 'Gateway' as const,
      id: 'gw-1',
    };

    fabric.registerProvider({
      id: 'iface-provider',
      owner: 'test',
      async discover() {
        return [wifi, eth, gateway];
      },
    });

    await fabric.discover();
    const result = fabric.select({ kind: 'Interface', now });

    expect(result.selected?.id).toBe('eth-1');
    expect(result.selected?.kind).toBe('Interface');
    expect(result.candidates.map((c) => c.id)).toContain('eth-1');
    expect(result.candidates.map((c) => c.id)).toContain('wifi-1');
    expect(result.rejected.some((r) => r.id === 'gw-1' && r.reason === 'kind-mismatch')).toBe(true);
  });

  it('rejects stale interfaces during selection', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const fresh = makeInterface('fresh-if');
    const stale = makeInterface('stale-if', {
      expiresAt: new Date(Date.now() - 5_000).toISOString(),
    });

    fabric.registerProvider({
      id: 'stale-provider',
      owner: 'test',
      async discover() {
        return [fresh, stale];
      },
    });

    await fabric.discover();
    const result = fabric.select({ kind: 'Interface', now });

    expect(result.selected?.id).toBe('fresh-if');
    expect(result.rejected.some((r) => r.id === 'stale-if' && r.reason === 'stale-resource')).toBe(
      true,
    );
  });

  it('classifies expired interface as non-fresh via evaluateFabricFreshness', () => {
    const expired = makeInterface('stale-if', {
      expiresAt: new Date(Date.now() - 5_000).toISOString(),
    });
    const report = evaluateFabricFreshness(expired, now);
    expect(report.fresh).toBe(false);
    expect(report.expiredForMs).toBeGreaterThan(0);
  });
});
