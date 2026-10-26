import { describe, expect, it } from 'vitest';
import {
  ProgrammableConnectivityFabric,
  type FabricResource,
  type FabricDiscoveryProvider,
  detectIntentDrift,
  type CompiledIntent,
} from '../src/index.js';

describe('Phase 92 — Connectivity Service Assurance regressions', () => {
  const now = new Date().toISOString();

  const makeResource = (
    id: string,
    overrides: Partial<FabricResource> = {},
  ): FabricResource => ({
    id,
    kind: 'ApplicationPath',
    state: 'HEALTHY',
    health: { status: 'healthy', score: 90, checkedAt: now },
    confidence: 0.9,
    observedAt: now,
    trust: 0.85,
    capacity: { bandwidthMbps: 100 },
    cost: { latencyMs: 10 },
    owner: 'path-adapter',
    failureDomains: [`domain-${id}`],
    lifecycle: 'active',
    capabilities: [
      {
        id: 'path.select',
        scope: 'applicationpath',
        authority: 'runtime',
        trust: 0.9,
        safety: 'governed',
        platforms: ['linux'],
      },
    ],
    metadata: { application: 'api', region: 'ir-central' },
    ...overrides,
  });

  it('exposes fabric health and freshness as assurance signals', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const healthy = makeResource('path-healthy');
    const stale = makeResource('path-stale', {
      observedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      health: { status: 'degraded', score: 40, checkedAt: now },
    });

    const provider: FabricDiscoveryProvider = {
      id: 'assurance-sources',
      owner: 'path-adapter',
      async discover() {
        return [healthy, stale];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    const snapshot = fabric.snapshotState();
    expect(snapshot.resources).toHaveLength(2);
    const healthyFound = snapshot.resources.find((r) => r.id === 'path-healthy');
    expect(healthyFound?.health.status).toBe('healthy');
    expect(healthyFound?.health.score).toBe(90);

    const freshness = fabric.freshnessReport(now);
    expect(freshness.find((f) => f.resourceId === 'path-healthy')?.fresh).toBe(true);
    expect(freshness.find((f) => f.resourceId === 'path-stale')?.fresh).toBe(false);
  });

  it('detects drift between intended connectivity outcome and observed fabric state', () => {
    const intent: CompiledIntent = {
      intentId: 'intent-assure-1',
      version: 1,
      objectives: { latency: 20, reliability: 0.99 },
      effectiveFrom: new Date(Date.now() - 60_000).toISOString(),
      effectiveUntil: new Date(Date.now() + 60_000).toISOString(),
      constraints: {},
      metadata: {},
    };

    const observedHealthy = { latency: 15, reliability: 0.995 };
    const healthyDrift = detectIntentDrift(intent, observedHealthy);
    expect(healthyDrift.severity).toBe('none');
    expect(healthyDrift.recommendedAdmission).toBe('ALLOW');

    const observedDegraded = { latency: 80, reliability: 0.7 };
    const degradedDrift = detectIntentDrift(intent, observedDegraded);
    expect(degradedDrift.severity).not.toBe('none');
    expect(degradedDrift.recommendedAdmission).toBe('OBSERVE_ONLY');
    expect(degradedDrift.reasons.some((r) => r.includes('latency'))).toBe(true);
    expect(degradedDrift.reasons.some((r) => r.includes('reliability'))).toBe(true);
  });

  it('routes assurance-driven re-selection through existing fabric select (no parallel mutation path)', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const primary = makeResource('path-primary', {
      health: { status: 'healthy', score: 95, checkedAt: now },
      failureDomains: ['region-a'],
    });
    const backup = makeResource('path-backup', {
      health: { status: 'healthy', score: 70, checkedAt: now },
      failureDomains: ['region-b'],
    });
    const failed = makeResource('path-failed', {
      state: 'FAILED',
      health: { status: 'failed', score: 10, checkedAt: now },
      failureDomains: ['region-c'],
    });

    const provider: FabricDiscoveryProvider = {
      id: 'assurance-sources',
      owner: 'path-adapter',
      async discover() {
        return [primary, backup, failed];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    // Assurance observes degraded primary via health signal and re-selects.
    const result = fabric.select({ kind: 'ApplicationPath', now });
    expect(result.selected?.id).toBe('path-primary');
    expect(result.rejected.some((r) => r.id === 'path-failed' && r.reason.startsWith('state-'))).toBe(
      true,
    );

    // Fail-closed on insufficient diversity remains the existing boundary.
    const shortfall = fabric.select({
      kind: 'ApplicationPath',
      minimumDiverseAlternatives: 3,
      now,
    });
    expect(shortfall.selected).toBeUndefined();
    expect(
      shortfall.rejected.some((r) => r.reason === 'insufficient-failure-domain-diversity'),
    ).toBe(true);
  });
});
