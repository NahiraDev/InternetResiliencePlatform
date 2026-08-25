import { describe, expect, it } from 'vitest';
import { isIP } from 'node:net';
import { BUILTIN_PROVIDER_METADATA, GLOBAL_PROVIDER_METADATA as CATALOG_GLOBAL, IRANIAN_PROVIDER_METADATA as CATALOG_IRAN, PROVIDER_CATALOG } from './provider-catalog.js';
import { ADDITIONAL_IRANIAN_PROVIDER_METADATA } from './provider-catalog-additional.js';
import { ALL_PROVIDER_METADATA, createAllBuiltinProviders, isIranianProvider, regionalReachabilityMultiplier } from './provider-registry.js';

const requiredIranianIds = [
  'shecan', 'shecan-2', 'begzar', 'begzar-2', '403', 'radar', 'electro', 'shatel',
  'shelter', 'shelter-2', 'beshkan', 'nobarcloud', 'dynx', 'bertina', '3dns', 'tic',
  'tci', 'ipm', 'asiatech', 'derak-cloud', 'irnic', 'pishgaman', 'rightel', 'irancell',
  'mci', 'shahrad', 'parsonline', 'irost', 'tums', 'arvancloud', 'farabordadeh',
  'parvazsys', 'hesabgar',
];

describe('expanded DNS provider catalog', () => {
  it('contains unique provider ids and valid endpoint metadata', () => {
    const ids = ALL_PROVIDER_METADATA.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const provider of ALL_PROVIDER_METADATA) {
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
    const ids = new Set(ALL_PROVIDER_METADATA.filter((provider) => provider.country === 'IR').map((p) => p.id));
    for (const id of requiredIranianIds) expect(ids.has(id)).toBe(true);
    expect(ids.size).toBeGreaterThanOrEqual(requiredIranianIds.length);
    expect(CATALOG_IRAN.length + ADDITIONAL_IRANIAN_PROVIDER_METADATA.length).toBe(ids.size);
  });

  it('retains the original builtin global providers and extends the global catalog', () => {
    expect(BUILTIN_PROVIDER_METADATA.map((entry) => entry.id)).toEqual([
      'cloudflare', 'google', 'quad9', 'opendns', 'controld', 'adguard', 'nextdns', 'cleanbrowsing',
    ]);
    expect(CATALOG_GLOBAL.length).toBeGreaterThanOrEqual(10);
  });

  it('does not duplicate provider identities across catalog layers', () => {
    const ids = [...PROVIDER_CATALOG, ...ADDITIONAL_IRANIAN_PROVIDER_METADATA, ...BUILTIN_PROVIDER_METADATA].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('creates every catalog entry as a real runtime candidate', () => {
    const providers = createAllBuiltinProviders();
    expect(providers.length).toBe(ALL_PROVIDER_METADATA.length);
    expect(providers.filter(isIranianProvider).length).toBeGreaterThanOrEqual(requiredIranianIds.length);
    expect(providers.some((provider) => provider.id === 'shecan')).toBe(true);
    expect(providers.some((provider) => provider.id === 'cloudflare')).toBe(true);
  });

  it('derives DoH/DoT/DNSSEC capability from metadata', () => {
    const providers = createAllBuiltinProviders();
    const byId = new Map(ALL_PROVIDER_METADATA.map((entry) => [entry.id, entry]));
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
