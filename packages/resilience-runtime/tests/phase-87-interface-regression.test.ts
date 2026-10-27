import { describe, expect, it } from 'vitest';
import {
  ProgrammableConnectivityFabric,
  type FabricResource,
} from '../src/index.js';

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

const iface = (over: Partial<FabricResource> = {}): FabricResource => ({
  id: 'if-default',
  kind: 'Interface',
  state: 'HEALTHY',
  health: { status: 'healthy', score: 80, checkedAt: iso() },
  confidence: 0.85,
  observedAt: iso(),
  trust: 0.9,
  capacity: { bandwidthMbps: 100 },
  cost: { unit: 1 },
  owner: 'linux-client',
  failureDomains: ['wifi'],
  lifecycle: 'active',
  capabilities: [
    {
      id: 'interface.use',
      scope: 'interface',
      authority: 'adapter',
      trust: 0.9,
      safety: 'safe',
      platforms: ['linux', 'any'],
    },
  ],
  metadata: { media: 'wifi' },
  ...over,
});

const provider = (id: string, owner: string, resources: FabricResource[]) => ({
  id,
  owner,
  async discover() {
    return resources;
  },
});

describe('Phase 87 — Multi-Interface Intelligence regressions', () => {
  it('selects the highest-ranked Interface among multiple candidates', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    fabric.registerProvider(
      provider('multi-if', 'linux-client', [
        iface({ id: 'eth0', health: { status: 'healthy', score: 95, checkedAt: iso() }, failureDomains: ['ethernet'] }),
        iface({ id: 'wlan0', health: { status: 'healthy', score: 70, checkedAt: iso() }, failureDomains: ['wifi'] }),
        iface({ id: 'wwan0', health: { status: 'degraded', score: 40, checkedAt: iso() }, state: 'DEGRADED', failureDomains: ['cellular'] }),
      ]),
    );
    await fabric.discover();

    const selection = fabric.select({ kind: 'Interface' });
    expect(selection.selected?.id).toBe('eth0');
    expect(selection.candidates.map((c) => c.id)).toEqual(['eth0', 'wlan0', 'wwan0']);
    expect(selection.reason).toBeTruthy();
  });

  it('rejects non-Interface resources when kind filter is applied', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    fabric.registerProvider(
      provider('mixed', 'linux-client', [
        iface({ id: 'eth0' }),
        { ...iface({ id: 'gw-1' }), kind: 'Gateway' as const },
      ]),
    );
    await fabric.discover();

    const selection = fabric.select({ kind: 'Interface' });
    expect(selection.selected?.id).toBe('eth0');
    expect(selection.rejected).toContainEqual({ id: 'gw-1', reason: 'kind-mismatch' });
  });

  it('excludes stale Interface resources from selection', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    fabric.registerProvider(
      provider('stale-if', 'linux-client', [
        iface({ id: 'eth0-fresh' }),
        iface({ id: 'wlan0-stale', expiresAt: iso(-10_000) }),
      ]),
    );
    await fabric.discover();

    const selection = fabric.select({ kind: 'Interface' });
    expect(selection.selected?.id).toBe('eth0-fresh');
    expect(selection.rejected).toContainEqual({ id: 'wlan0-stale', reason: 'stale-resource' });
  });

  it('prefers higher trust and lower cost when health scores are equal', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    fabric.registerProvider(
      provider('tiebreak', 'linux-client', [
        iface({
          id: 'low-trust',
          trust: 0.6,
          cost: { unit: 5 },
          health: { status: 'healthy', score: 80, checkedAt: iso() },
        }),
        iface({
          id: 'high-trust',
          trust: 0.95,
          cost: { unit: 1 },
          health: { status: 'healthy', score: 80, checkedAt: iso() },
        }),
      ]),
    );
    await fabric.discover();

    const selection = fabric.select({ kind: 'Interface' });
    expect(selection.selected?.id).toBe('high-trust');
  });
});
