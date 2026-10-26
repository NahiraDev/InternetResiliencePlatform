import { describe, expect, it } from 'vitest';
import {
  ProgrammableConnectivityFabric,
  type FabricResource,
  type FabricDiscoveryProvider,
} from '../src/index.js';

describe('Phase 90 — DNS / Tunnel / Proxy Orchestration regressions', () => {
  const now = new Date().toISOString();
  const makeResource = (
    id: string,
    kind: FabricResource['kind'],
    overrides: Partial<FabricResource> = {},
  ): FabricResource => ({
    id,
    kind,
    state: 'HEALTHY',
    health: { status: 'healthy', score: 90, checkedAt: now },
    confidence: 0.9,
    observedAt: now,
    trust: 0.85,
    capacity: { bandwidthMbps: 100 },
    cost: { latencyMs: 10 },
    owner: 'orchestration-adapter',
    failureDomains: [`${kind.toLowerCase()}-${id}`],
    lifecycle: 'active',
    capabilities: [
      {
        id: `${kind.toLowerCase()}.select`,
        scope: kind.toLowerCase(),
        authority: 'runtime',
        trust: 0.9,
        safety: 'governed',
        platforms: ['linux'],
      },
    ],
    metadata: { region: 'ir-central' },
    ...overrides,
  });

  it('selects among multiple healthy Resolver (DNS) candidates preferring higher health', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const primary = makeResource('dns-primary', 'Resolver', {
      health: { status: 'healthy', score: 95, checkedAt: now },
      failureDomains: ['region-a'],
    });
    const backup = makeResource('dns-backup', 'Resolver', {
      health: { status: 'healthy', score: 75, checkedAt: now },
      cost: { latencyMs: 30 },
      failureDomains: ['region-b'],
    });

    const provider: FabricDiscoveryProvider = {
      id: 'dns-sources',
      owner: 'dns-adapter',
      async discover() {
        return [primary, backup];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    const result = fabric.select({ kind: 'Resolver', now });
    expect(result.selected?.id).toBe('dns-primary');
    expect(result.candidates).toHaveLength(2);
    expect(result.diversity?.diverse.length).toBeGreaterThanOrEqual(1);
    expect(result.reason).toBeTruthy();
  });

  it('filters stale Tunnel resources from selection', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const fresh = makeResource('tun-fresh', 'Tunnel');
    const stale = makeResource('tun-stale', 'Tunnel', {
      observedAt: new Date(Date.now() - 180_000).toISOString(),
      expiresAt: new Date(Date.now() - 90_000).toISOString(),
    });

    const provider: FabricDiscoveryProvider = {
      id: 'tunnel-sources',
      owner: 'tunnel-adapter',
      async discover() {
        return [fresh, stale];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    const result = fabric.select({ kind: 'Tunnel', now });
    expect(result.selected?.id).toBe('tun-fresh');
    expect(result.candidates).toHaveLength(1);
    expect(result.rejected.some((r) => r.id === 'tun-stale' && r.reason === 'stale-resource')).toBe(
      true,
    );
  });

  it('supports diversity preference via failure domains for Proxy and fails closed when required diversity is unmet', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const sameDomain1 = makeResource('proxy-a', 'Proxy', { failureDomains: ['shared-region'] });
    const sameDomain2 = makeResource('proxy-b', 'Proxy', { failureDomains: ['shared-region'] });

    const provider: FabricDiscoveryProvider = {
      id: 'proxy-sources',
      owner: 'proxy-adapter',
      async discover() {
        return [sameDomain1, sameDomain2];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    const result = fabric.select({
      kind: 'Proxy',
      minimumDiverseAlternatives: 2,
      now,
    });
    // Shared failure domain means diversity shortfall; selection must fail closed
    expect(result.selected).toBeUndefined();
    expect(result.rejected.some((r) => r.reason === 'insufficient-failure-domain-diversity')).toBe(
      true,
    );
  });

  it('exposes Resolver, Tunnel, and Proxy inventory attributes including ownership and failure domains', async () => {
    const fabric = new ProgrammableConnectivityFabric();
    const dns = makeResource('dns-inventory', 'Resolver', {
      owner: 'control-plane',
      failureDomains: ['az-1', 'provider-x'],
    });
    const tun = makeResource('tun-inventory', 'Tunnel', {
      owner: 'control-plane',
      failureDomains: ['az-2'],
    });
    const proxy = makeResource('proxy-inventory', 'Proxy', {
      owner: 'control-plane',
      failureDomains: ['az-3'],
    });

    const provider: FabricDiscoveryProvider = {
      id: 'orchestration-inventory',
      owner: 'orchestration-adapter',
      async discover() {
        return [dns, tun, proxy];
      },
    };
    fabric.registerProvider(provider);
    await fabric.discover();

    const snapshot = fabric.snapshotState();
    const dnsRes = snapshot.resources.find((r) => r.id === 'dns-inventory');
    expect(dnsRes).toBeDefined();
    expect(dnsRes?.kind).toBe('Resolver');
    expect(dnsRes?.owner).toBe('control-plane');
    expect(dnsRes?.failureDomains).toEqual(['az-1', 'provider-x']);
    expect(dnsRes?.health.status).toBe('healthy');

    const tunRes = snapshot.resources.find((r) => r.id === 'tun-inventory');
    expect(tunRes?.kind).toBe('Tunnel');
    expect(tunRes?.owner).toBe('control-plane');

    const proxyRes = snapshot.resources.find((r) => r.id === 'proxy-inventory');
    expect(proxyRes?.kind).toBe('Proxy');
    expect(proxyRes?.owner).toBe('control-plane');
  });
});
