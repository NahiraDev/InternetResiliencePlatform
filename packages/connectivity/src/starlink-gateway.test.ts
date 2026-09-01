import { describe, expect, it } from 'vitest';
import {
  ExternalStarlinkGatewayProvider,
  createStarlinkGatewayHealthProbe,
  type StarlinkGatewayProfile,
} from './starlink-gateway.js';

const profile: StarlinkGatewayProfile = {
  id: 'starlink-egress-test',
  name: 'Test Starlink Egress',
  source: 'starlink-reverse-egress',
  protocol: 'wireguard',
  endpoint: 'gateway.example.invalid:443',
  tags: ['starlink', 'egress'],
};

describe('ExternalStarlinkGatewayProvider', () => {
  it('adapts a healthy external gateway into a connectivity resource', async () => {
    const provider = new ExternalStarlinkGatewayProvider(
      [profile],
      createStarlinkGatewayHealthProbe(async () => ({
        score: 94,
        status: 'healthy',
        latencyMs: 71,
        packetLoss: 0,
        internetReachable: true,
        gatewayReachable: true,
        checkedAt: new Date(0).toISOString(),
        source: 'provider',
      })),
    );

    const resources = await provider.discover();

    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({
      providerId: 'starlink-external-gateways',
      id: profile.id,
      state: 'active',
      priority: 45,
      metadata: {
        starlink: true,
        externalGateway: true,
        source: 'starlink-reverse-egress',
        protocol: 'wireguard',
        endpointConfigured: true,
      },
    });
  });

  it('does not expose disabled profiles as resources', async () => {
    const provider = new ExternalStarlinkGatewayProvider(
      [{ ...profile, enabled: false }],
      createStarlinkGatewayHealthProbe(async () => ({
        score: 100,
        status: 'healthy',
        checkedAt: new Date(0).toISOString(),
        source: 'provider',
      })),
    );

    await expect(provider.discover()).resolves.toEqual([]);
  });

  it('rejects duplicate profile ids', () => {
    expect(
      () =>
        new ExternalStarlinkGatewayProvider(
          [profile, { ...profile, name: 'Duplicate' }],
          createStarlinkGatewayHealthProbe(async () => ({
            score: 100,
            status: 'healthy',
            checkedAt: new Date(0).toISOString(),
            source: 'provider',
          })),
        ),
    ).toThrow('Duplicate Starlink gateway id');
  });
});
