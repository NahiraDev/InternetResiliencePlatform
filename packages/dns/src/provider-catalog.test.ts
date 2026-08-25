import { describe, expect, it } from 'vitest';
import { isIP } from 'node:net';
import { BUILTIN_PROVIDER_METADATA, GLOBAL_PROVIDER_METADATA, IRANIAN_PROVIDER_METADATA, PROVIDER_CATALOG } from './provider-catalog.js';
import { createAllBuiltinProviders, isIranianProvider, regionalReachabilityMultiplier } from './provider-registry.js';

const requiredIranianIds = [
  'shecan', 'shecan-2', 'begzar', 'begzar-2', '403', 'radar', 'electro', 'shatel',
  'shelter', 'shelter-2', 'beshkan', 'nobarcloud', 'dynx', 'bertina', '3dns', 'tic',
  'tci', 'ipm', 'asiatech', 'derak-cloud', 'irnic', 'pishgaman', 'rightel', 'irancell',
  'mci', 'shahrad', 'parsonline', 'irost', 'tums', 'arvancloud', 'farabordadeh',
  'parvazsys', 'hesabgar',
];

describe('expanded DNS provider catalog', () => {
  it('contains unique provider ids and valid endpoint metadata', () => {
    const ids = PROVIDER_CATALOG.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const provider of PROVIDER_CATALOG) {
      expect(provider.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(provider.name.length).toBeGreaterThan(0);
      expect(provider.homepage).toMatch(/^https:\/\//);
      expect(provider.endpoints.ipv4.length + provider.endpoints.ipv6.length).toBeGreaterThan(0);
      for (const address of provider.endpoints.ipv4) expect(isIP(address)).toBe(4);
      for (const address of provider.endpoints.ipv6) expect(isIP(address)).toBe(6);
      if (provider.endpoints.doh) expect(provider.endpoints.doh).toMatch(/^https:\/\//);
      if (provider.endpoints.dot) expect(provider.endpoints.dot).not.toContain('://');
      expect(provider.tags.length).toBeGreaterThan(0);
    }
  });

  it('contains the Iranian resolver families discovered across the audited sources', () => {
    const ids = new Set(IRANIAN_PROVIDER_METADATA.map((provider) => provider.id));
    for (const id of requiredIranianIds) expect(ids.has(id)).toBe(true);
    expect(IRANIAN_PROVIDER_METADATA.length).toBeGreaterThanOrEqual(requiredIranianIds.length);
  });

  it('retains the original builtin global providers and extends the global catalog', () => {
    expect(BUILTIN_PROVIDER_METADATA.map((entry) => entry.id)).toEqual([
      'cloudflare', 'google', 'quad9', 'opendns', 'controld', 'adguard', 'nextdns', 'cleanbrowsing',
    ]);
    expect(GLOBAL_PROVIDER_METADATA.length).toBeGreaterThanOrEqual(10);
  });

  it('creates every catalog entry as a real runtime candidate', () => {
    const providers = createAllBuiltinProviders();
    expect(providers.length).toBe(BUILTIN_PROVIDER_METADATA.length + GLOBAL_PROVIDER_METADATA.length + IRANIAN_PROVIDER_METADATA.length);
    expect(providers.filter(isIranianProvider).length).toBe(IRANIAN_PROVIDER_METADATA.length);
    expect(providers.some((provider) => provider.id === 'shecan')).toBe(true);
    expect(providers.some((provider) => provider.id === 'cloudflare')).toBe(true);
  });

  it('derives DoH/DoT/DNSSEC capability from metadata', () => {
    const providers = createAllBuiltinProviders();
    const byId = new Map(PROVIDER_CATALOG.map((entry) => [entry.id, entry]));
    for (const provider of providers) {
      const metadata = byId.get(provider.id)!;
      expect(provider.supportsDoH()).toBe(Boolean(metadata.endpoints.doh));
      expect(provider.supportsDoT()).toBe(Boolean(metadata.endpoints.dot));
      expect(provider.supportsDNSSEC()).toBe(metadata.dnssec);
    }
  });

  it('does not give Iranian providers an unconditional selection advantage', () => {
    const iranian = createAllBuiltinProviders().find((provider) => provider.id === 'shecan')!;
    const global = createAllBuiltinProviders().find((provider) => provider.id === 'cloudflare')!;
    expect(regionalReachabilityMultiplier(iranian, 0.5)).toBe(1);
    expect(regionalReachabilityMultiplier(global, 0)).toBe(1);
    expect(regionalReachabilityMultiplier(iranian, 0)).toBeLessThan(1);
    expect(regionalReachabilityMultiplier(iranian, 1)).toBeGreaterThan(1);
  });
});
