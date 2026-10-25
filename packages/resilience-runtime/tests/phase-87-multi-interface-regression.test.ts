import { describe, expect, it } from 'vitest';
import {
  ProgrammableConnectivityFabric,
  type FabricResource,
  type FabricDiscoveryProvider,
  type FabricCapability,
} from '../src/index.js';

describe('Phase 87 — Multi-Interface Intelligence regressions', () => {
  const now = new Date().toISOString();
  const makeInterface = (
    id: string,
    overrides: Partial<FabricResource> = {},
  ): FabricResource => ({
    id,
    kind: 'Interface',
    state: 'HEALTHY',
    health: { status: 'healthy', score: 95, checkedAt: now },
    confidence: 0.95,
    observedAt: now,
    trust: 0.9,
    capacity: { bandwidthMbps: 100 },
    cost: { latencyMs: 5 },
    owner: 'linux-adapter',
    failureDomains: [`nic-${id}`],
    lifecycle: 'active',
    capabilities: [
      {
        id: 'interface.select',
        scope: 'interface',
        authority: 'runtime',
        trust: 0.95,
        safety: 'governed',
        platforms: ['linux'],
      },
    ],
    metadata: { type: 'ethernet' },
    ...overrides,
  });

  it('selects among multiple healthy Interface resources', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const eth0 = makeInterface('eth0');
    const wlan0 = makeInterface('wlan0', {
      health: { status: 'healthy', score: 80, checkedAt: now },
      cost: { latencyMs: 15 },
      failureDomains: ['nic-wlan0'],
    });

    const provider: FabricDiscoveryProvider = {
      id: 'linux-ifaces',
      owner: 'linux-adapter',
      async discover() {
        return [eth0, wlan0];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    const result = fabric.select({ kind: 'Interface', now });
    expect(result.selected?.id).toBe('eth0'); // higher health score
    expect(result.candidates).toHaveLength(2);
    expect(result.reason).toContain('eth0');
  });

  it('filters stale Interface resources from selection', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const fresh = makeInterface('eth0');
    const stale = makeInterface('wlan0', {
      observedAt: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const provider: FabricDiscoveryProvider = {
      id: 'linux-ifaces',
      owner: 'linux-adapter',
      async discover() {
        return [fresh, stale];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    const result = fabric.select({ kind: 'Interface', now });
    expect(result.selected?.id).toBe('eth0');
    expect(result.candidates).toHaveLength(1);
    expect(result.rejected.some((r) => r.id === 'wlan0' && r.reason === 'stale-resource')).toBe(
      true,
    );
  });

  it('rejects Interface lacking platform capability authority', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const restricted = makeInterface('cellular0', {
      capabilities: [
        {
          id: 'interface.select',
          scope: 'interface',
          authority: 'adapter',
          trust: 0.4,
          safety: 'safe',
          platforms: ['android'],
        } as FabricCapability,
      ],
    });

    const provider: FabricDiscoveryProvider = {
      id: 'mobile-ifaces',
      owner: 'android-adapter',
      async discover() {
        return [restricted];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    const result = fabric.select({
      kind: 'Interface',
      requiredCapabilities: ['interface.select'],
      platform: 'linux',
      minimumTrust: 0.8,
      requireRuntimeAuthority: true,
      now,
    });
    expect(result.selected).toBeUndefined();
    expect(result.rejected.length).toBeGreaterThan(0);
    expect(result.rejected[0]?.reason).toMatch(/capability-denied/);
  });
});
