import { describe, expect, it } from 'vitest';
import {
  assertFabricStateTransition,
  IllegalFabricStateTransitionError,
  evaluateFabricFreshness,
  FabricCapabilityAuthority,
  type FabricResource,
  type FabricCapability,
} from '../src/index.js';

describe('Phase 86 — Unified Connectivity Fabric regressions', () => {
  describe('state transition fail-closed', () => {
    it('rejects illegal FAILED -> HEALTHY transition', () => {
      expect(() => assertFabricStateTransition('FAILED', 'HEALTHY')).toThrow(
        IllegalFabricStateTransitionError,
      );
    });

    it('allows FAILED -> RECOVERING', () => {
      expect(() => assertFabricStateTransition('FAILED', 'RECOVERING')).not.toThrow();
    });

    it('allows same-state no-op', () => {
      expect(() => assertFabricStateTransition('HEALTHY', 'HEALTHY')).not.toThrow();
    });
  });

  describe('freshness evaluation', () => {
    const now = new Date().toISOString();
    const base: FabricResource = {
      id: 'r1',
      kind: 'Gateway',
      state: 'HEALTHY',
      health: { status: 'healthy', score: 90, checkedAt: now },
      confidence: 0.9,
      observedAt: new Date(Date.now() - 30_000).toISOString(),
      trust: 0.9,
      capacity: {},
      cost: {},
      owner: 'test',
      failureDomains: ['d1'],
      lifecycle: 'active',
      capabilities: [],
      metadata: {},
    };

    it('classifies recent observation as fresh when no expiry', () => {
      const report = evaluateFabricFreshness(base, now);
      expect(report.fresh).toBe(true);
    });

    it('classifies expired resource as stale', () => {
      const expired = { ...base, expiresAt: new Date(Date.now() - 1_000).toISOString() };
      const report = evaluateFabricFreshness(expired, now);
      expect(report.fresh).toBe(false);
      expect(report.expiredForMs).toBeGreaterThan(0);
    });
  });

  describe('capability authority', () => {
    it('rejects capability with insufficient trust', () => {
      const auth = new FabricCapabilityAuthority();
      const cap: FabricCapability = {
        id: 'route.select',
        scope: 'gateway',
        authority: 'adapter',
        trust: 0.5,
        safety: 'safe',
        platforms: ['linux'],
      };
      auth.register(cap);
      const decision = auth.authorize({
        capabilityId: 'route.select',
        resourceId: 'gw-1',
        scope: 'gateway',
        minimumTrust: 0.8,
        platform: 'linux',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reasons.some((r) => r.includes('insufficient-trust'))).toBe(true);
    });

    it('allows matching high-trust runtime capability', () => {
      const auth = new FabricCapabilityAuthority();
      const cap: FabricCapability = {
        id: 'route.select',
        scope: 'gateway',
        authority: 'runtime',
        trust: 0.95,
        safety: 'governed',
        platforms: ['linux', 'any'],
      };
      auth.register(cap);
      const decision = auth.authorize({
        capabilityId: 'route.select',
        resourceId: 'gw-1',
        scope: 'gateway',
        minimumTrust: 0.8,
        platform: 'linux',
        requireRuntimeAuthority: true,
      });
      expect(decision.allowed).toBe(true);
      expect(decision.reasons).toHaveLength(0);
    });
  });
});
