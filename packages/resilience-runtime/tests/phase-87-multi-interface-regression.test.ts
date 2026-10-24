import { describe, expect, it } from 'vitest';
import {
  evaluateFabricFreshness,
  selectDiverseResources,
  partitionByFreshness,
  FabricCapabilityAuthority,
  type FabricResource,
  type FabricCapability,
} from '../src/index.js';

describe('Phase 87 — Multi-Interface Intelligence regressions', () => {
  const now = new Date().toISOString();
  const makeInterface = (overrides: Partial<FabricResource> = {}): FabricResource => ({
    id: 'iface-eth0',
    kind: 'Interface',
    state: 'HEALTHY',
    health: { status: 'healthy', score: 95, checkedAt: now },
    confidence: 0.95,
    observedAt: new Date(Date.now() - 10_000).toISOString(),
    trust: 0.9,
    capacity: { bandwidthMbps: 1000 },
    cost: { latencyMs: 5 },
    owner: 'linux-adapter',
    failureDomains: ['nic-1'],
    lifecycle: 'active',
    capabilities: [],
    metadata: { media: 'ethernet' },
    ...overrides,
  });

  describe('interface freshness and partition', () => {
    it('treats recent Interface observation as fresh', () => {
      const iface = makeInterface();
      const report = evaluateFabricFreshness(iface, now);
      expect(report.fresh).toBe(true);
      expect(report.ageMs).toBeLessThan(60_000);
    });

    it('partitions expired Interface as stale', () => {
      const expired = makeInterface({
        id: 'iface-wlan0',
        expiresAt: new Date(Date.now() - 5_000).toISOString(),
        failureDomains: ['nic-2'],
      });
      const fresh = makeInterface({ id: 'iface-eth0' });
      const { fresh: f, stale } = partitionByFreshness([fresh, expired], now);
      expect(f.map((r) => r.id)).toEqual(['iface-eth0']);
      expect(stale.map((r) => r.id)).toEqual(['iface-wlan0']);
    });
  });

  describe('diverse selection among interfaces', () => {
    it('selects failure-domain-disjoint Interfaces', () => {
      const eth = makeInterface({ id: 'eth0', failureDomains: ['domain-a'], health: { status: 'healthy', score: 90, checkedAt: now } });
      const wifi = makeInterface({ id: 'wlan0', failureDomains: ['domain-b'], health: { status: 'healthy', score: 80, checkedAt: now } });
      const same = makeInterface({ id: 'eth1', failureDomains: ['domain-a'], health: { status: 'healthy', score: 85, checkedAt: now } });
      const ranked = [eth, wifi, same];
      const result = selectDiverseResources(ranked, { required: 2 });
      expect(result.selected?.id).toBe('eth0');
      expect(result.diverse.map((r) => r.id)).toEqual(expect.arrayContaining(['eth0', 'wlan0']));
      expect(result.diverse).toHaveLength(2);
      expect(result.distinctFailureDomains).toBe(2);
    });

    it('fail-closed when diversity floor cannot be met', () => {
      const only = makeInterface({ id: 'only', failureDomains: ['single'] });
      const result = selectDiverseResources([only], { required: 2 });
      expect(result.diverse).toHaveLength(1);
      expect(result.reason).toMatch(/fewer than 2/);
    });
  });

  describe('capability authority for interfaces', () => {
    it('rejects low-trust adapter capability on Interface', () => {
      const auth = new FabricCapabilityAuthority();
      const cap: FabricCapability = {
        id: 'interface.select',
        scope: 'interface',
        authority: 'adapter',
        trust: 0.4,
        safety: 'safe',
        platforms: ['linux'],
      };
      auth.register(cap);
      const decision = auth.authorize({
        capabilityId: 'interface.select',
        resourceId: 'iface-eth0',
        scope: 'interface',
        minimumTrust: 0.7,
        platform: 'linux',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reasons.some((r) => r.includes('insufficient-trust'))).toBe(true);
    });

    it('allows runtime-authority high-trust Interface capability', () => {
      const auth = new FabricCapabilityAuthority();
      const cap: FabricCapability = {
        id: 'interface.select',
        scope: 'interface',
        authority: 'runtime',
        trust: 0.92,
        safety: 'governed',
        platforms: ['linux', 'any'],
      };
      auth.register(cap);
      const decision = auth.authorize({
        capabilityId: 'interface.select',
        resourceId: 'iface-eth0',
        scope: 'interface',
        minimumTrust: 0.8,
        platform: 'linux',
        requireRuntimeAuthority: true,
      });
      expect(decision.allowed).toBe(true);
    });
  });
});
