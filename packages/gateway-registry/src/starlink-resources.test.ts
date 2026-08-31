import { describe, expect, it } from 'vitest';
import { getStarlinkResource, listStarlinkResources, STARLINK_RESOURCES } from './starlink-resources.js';

describe('Starlink resource catalog', () => {
  it('contains every supplied resource without treating sample endpoints as public configs', () => {
    expect(STARLINK_RESOURCES).toHaveLength(11);
    expect(STARLINK_RESOURCES.every((resource) => resource.publicEndpointProvided === false)).toBe(true);
    expect(getStarlinkResource('egret')?.requiresUserOwnedStarlink).toBe(true);
    expect(getStarlinkResource('realink-setalink')?.requiresUserOwnedStarlink).toBe(false);
  });

  it('supports capability and protocol discovery', () => {
    const wireGuard = listStarlinkResources({ protocol: 'wireguard' });
    expect(wireGuard.map((resource) => resource.id)).toEqual(expect.arrayContaining([
      'starlink-reverse-egress',
      'getastatic',
      'egret',
      'nasnet-connect',
      'starlinux-pi-starlink',
      'gbrandt-pi-starlink',
    ]));

    const publicIp = listStarlinkResources({ capability: 'public-ip', freeOnly: true });
    expect(publicIp.map((resource) => resource.id)).toEqual(['getastatic', 'egret']);
  });

  it('never exposes a live endpoint merely because a provider has a displayed example IP', () => {
    const egret = getStarlinkResource('egret');
    expect(egret?.publicEndpointProvided).toBe(false);
    expect(egret?.notes.some((note) => note.includes('Displayed IP addresses are examples'))).toBe(true);
  });

  it('keeps catalog entries immutable from callers', () => {
    const result = listStarlinkResources({ protocol: 'wireguard' });
    const first = result.at(0);
    expect(first).toBeDefined();
    first?.protocols.push('openvpn');
    expect(first?.protocols).toContain('openvpn');
    expect(
      listStarlinkResources({ protocol: 'openvpn' }).some((resource) => resource.id === first?.id),
    ).toBe(false);
  });
});
