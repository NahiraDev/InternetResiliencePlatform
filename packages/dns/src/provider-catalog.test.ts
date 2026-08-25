import { describe, expect, it } from 'vitest';
import { EXTENDED_PROVIDER_METADATA } from './provider-catalog.js';

const ipv4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const ipv6 = /^[0-9a-f:]+$/i;

const requiredIranianIds = [
  'shecan',
  'shecan-2',
  'begzar',
  '403',
  'radar',
  'electro',
  'shatel',
  'shelter',
  'shelter-2',
  'beshkan',
  'nobarcloud',
  'dynx',
  'bertina',
  '3dns',
  'tic',
  'tci',
  'ipm',
  'asiatech',
  'derak-cloud',
  'irnic',
  'pishgaman',
  'rightel',
  'irancell',
  'mci',
  'shahrad',
  'parsonline',
  'irost',
  'tums',
  'arvancloud',
  'farabordadeh',
  'parvazsys',
  'hesabgar',
];

describe('expanded DNS provider catalog', () => {
  it('contains unique provider ids and non-empty endpoint sets', () => {
    const ids = EXTENDED_PROVIDER_METADATA.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const provider of EXTENDED_PROVIDER_METADATA) {
      expect(provider.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(provider.name.length).toBeGreaterThan(0);
      expect(provider.homepage).toMatch(/^https:\/\//);
      expect(provider.endpoints.ipv4.length + provider.endpoints.ipv6.length).toBeGreaterThan(0);
      for (const address of provider.endpoints.ipv4) expect(address).toMatch(ipv4);
      for (const address of provider.endpoints.ipv6) expect(address).toMatch(ipv6);
      if (provider.endpoints.doh) expect(provider.endpoints.doh).toMatch(/^https:\/\//);
      expect(provider.tags.length).toBeGreaterThan(0);
      expect(['curated', 'iran-public-dns', 'community-catalog']).toContain(provider.discovery);
    }
  });

  it('contains the Iranian resolver families discovered across the audited sources', () => {
    const ids = new Set(EXTENDED_PROVIDER_METADATA.filter((p) => p.region === 'IR').map((p) => p.id));
    for (const id of requiredIranianIds) expect(ids.has(id)).toBe(true);
  });

  it('keeps regional membership separate from runtime preference', () => {
    const iranian = EXTENDED_PROVIDER_METADATA.filter((provider) => provider.region === 'IR');
    expect(iranian.length).toBeGreaterThanOrEqual(20);
    expect(iranian.every((provider) => provider.tags.includes('iran'))).toBe(true);
  });
});
