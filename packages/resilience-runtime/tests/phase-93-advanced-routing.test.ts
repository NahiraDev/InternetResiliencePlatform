import { describe, expect, it } from 'vitest';
import {
  ProgrammableConnectivityFabric,
  type FabricDiscoveryProvider,
  type FabricResource,
} from '../src/index.js';

const now = '2026-10-27T12:00:00.000Z';

const route = (id: string, overrides: Partial<FabricResource> = {}): FabricResource => ({
  id,
  kind: 'Route',
  state: 'HEALTHY',
  health: { status: 'healthy', score: 80, checkedAt: now },
  confidence: 0.9,
  observedAt: now,
  trust: 0.8,
  capacity: { bandwidthMbps: 100 },
  cost: { latencyMs: 20 },
  owner: 'routing-adapter',
  failureDomains: [`domain-${id}`],
  lifecycle: 'active',
  capabilities: [],
  metadata: {},
  ...overrides,
});

const fabricWith = async (...resources: readonly FabricResource[]) => {
  const fabric = new ProgrammableConnectivityFabric();
  const provider: FabricDiscoveryProvider = {
    id: 'phase-93-routing',
    owner: 'routing-adapter',
    async discover() { return resources; },
  };
  fabric.registerProvider(provider);
  await fabric.discover();
  return fabric;
};

describe('Phase 93 — Advanced Routing Control', () => {
  it('ranks fresh routes deterministically by application affinity before health and cost', async () => {
    const genericHighHealth = route('generic-high-health', {
      health: { status: 'healthy', score: 99, checkedAt: now }, cost: { latencyMs: 1 }, metadata: { application: 'batch' },
    });
    const affinityRoute = route('interactive-route', {
      health: { status: 'healthy', score: 70, checkedAt: now }, cost: { latencyMs: 40 }, metadata: { application: 'interactive' },
    });
    const fabric = await fabricWith(genericHighHealth, affinityRoute);

    const result = fabric.select({
      kind: 'Route', now,
      intent: { intentId: 'intent-interactive', target: { application: 'interactive' }, constraints: {}, objectives: {} },
    });

    expect(result.selected?.id).toBe('interactive-route');
    expect(result.audit.intentId).toBe('intent-interactive');
    expect(result.audit.applicationAffinity).toBe('interactive');
    expect(result.audit.criteria).toContain('application-affinity');
  });

  it('applies supported intent routing constraints without treating the intent as mutation authority', async () => {
    const expensive = route('expensive', { cost: { latencyMs: 100 }, trust: 0.95 });
    const lowTrust = route('low-trust', { cost: { latencyMs: 10 }, trust: 0.2 });
    const eligible = route('eligible', { cost: { latencyMs: 10 }, trust: 0.8 });
    const fabric = await fabricWith(expensive, lowTrust, eligible);

    const result = fabric.select({
      kind: 'Route', now,
      intent: {
        intentId: 'intent-bounded', target: {}, objectives: {},
        constraints: { 'routing.maximumCost': 20, 'routing.minimumTrust': 0.7 },
      },
    });

    expect(result.selected?.id).toBe('eligible');
    expect(result.rejected).toEqual(expect.arrayContaining([
      { id: 'expensive', reason: 'cost-limit' },
      { id: 'low-trust', reason: 'insufficient-trust' },
    ]));
    expect(result.audit.selectedId).toBe('eligible');
  });

  it('fails closed for invalid intent constraints and stale or insufficiently diverse route candidates', async () => {
    const stale = route('stale', { observedAt: '2026-10-27T11:00:00.000Z', expiresAt: '2026-10-27T11:01:00.000Z' });
    const sameDomain = route('same-domain', { failureDomains: ['shared'] });
    const fabric = await fabricWith(stale, sameDomain);

    const invalid = fabric.select({
      kind: 'Route', now,
      intent: { intentId: 'invalid-intent', target: {}, objectives: {}, constraints: { 'routing.minimumTrust': 2 } },
    });
    expect(invalid.selected).toBeUndefined();
    expect(invalid.reason).toContain('fail-closed');
    expect(invalid.audit.rejected).toEqual([{ id: 'invalid-intent', reason: 'invalid-intent-routing-minimum-trust' }]);

    const diversity = fabric.select({ kind: 'Route', now, minimumDiverseAlternatives: 2 });
    expect(diversity.selected).toBeUndefined();
    expect(diversity.rejected).toEqual(expect.arrayContaining([
      { id: 'stale', reason: 'stale-resource' },
      { id: 'same-domain', reason: 'insufficient-failure-domain-diversity' },
    ]));
  });
});
