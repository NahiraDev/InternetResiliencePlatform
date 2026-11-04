/**
 * Shared Infrastructure Adapter Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SharedInfrastructureAdapter, createSharedInfrastructureAdapter } from '../src/shared-infrastructure-adapter.js';
import type { CapacityOffer, Entitlement, Allocation } from '../src/capacity-contracts.js';

describe('SharedInfrastructureAdapter', () => {
  let adapter: SharedInfrastructureAdapter;

  beforeEach(() => {
    adapter = createSharedInfrastructureAdapter({
      adapterId: 'test-shared-infra',
      authorizedGatewayIds: ['gw-1', 'gw-2'],
      region: 'us-east',
    });
  });

  function getFirstOffer(offers: CapacityOffer[]): CapacityOffer {
    const offer = offers[0];
    if (!offer) throw new Error('no offer found');
    return offer;
  }

  it('discovers offers for authorized gateways', async () => {
    const offers = await adapter.discoverOffers('us-east');

    expect(offers).toHaveLength(2);
    const offer = getFirstOffer(offers);
    expect(offer.providerId).toBe('shared-infra-us-east');
    expect(offer.model).toBe('shared-infrastructure');
    expect(offer.throughputClassMbps).toBe(100);
    expect(offer.protocols).toContain('wireguard');
    expect(offer.trust).toBe(0.9);
    expect(offer.failureDomain).toBe('fd-shared-us-east');
  });

  it('discovers offers with default region', async () => {
    const offers = await adapter.discoverOffers();

    expect(offers).toHaveLength(2);
    expect(getFirstOffer(offers).region).toBe('us-east');
  });

  it('acquires capacity from authorized gateway', async () => {
    const offers = await adapter.discoverOffers('us-east');
    const offer = getFirstOffer(offers);

    const entitlement: Entitlement = {
      entitlementId: 'ent-1',
      tenantId: 'tenant-1',
      planId: 'plan-1',
      scope: 'bandwidth.mbps.100.region.us-east',
      quotaBytes: 1024 * 1024 * 1024 * 30,
      usedBytes: 0,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      renewal: { autoRenew: false },
      status: 'active',
    };

    const allocation: Allocation = {
      allocationId: 'alloc-1',
      offerId: offer.offerId,
      entitlementId: entitlement.entitlementId,
      tenantId: 'tenant-1',
      reservedThroughputMbps: 100,
      reservedBytes: entitlement.quotaBytes,
      startAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      fencingToken: 'fence-1',
      decisionEpoch: 1,
      status: 'reserved',
    };

    const result = await adapter.acquire(offer, entitlement, allocation);

    expect(result.acquisitionId).toMatch(/^acq-/);
    expect(result.providerResourceId).toBe('gateway-gw-1');
    expect(result.credentialsRef).toContain('cred-gw-1');
    expect(result.tunnelConfig.protocol).toBe('wireguard');
    expect(result.tunnelConfig.parameters.gatewayId).toBe('gw-1');
    expect(result.tunnelConfig.parameters.offerId).toBe(offer.offerId);
    expect(result.tunnelConfig.parameters.allocationId).toBe(allocation.allocationId);
  });

  it('rejects acquisition for unauthorized gateway', async () => {
    const offers = await adapter.discoverOffers('us-east');
    const baseOffer = getFirstOffer(offers);

    const offer: CapacityOffer = {
      ...baseOffer,
      providerMetadata: { ...baseOffer.providerMetadata, gatewayId: 'unauthorized-gw' },
    };

    const entitlement: Entitlement = {
      entitlementId: 'ent-1',
      tenantId: 'tenant-1',
      planId: 'plan-1',
      scope: 'bandwidth.mbps.100.region.us-east',
      quotaBytes: 1024 * 1024 * 1024 * 30,
      usedBytes: 0,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      renewal: { autoRenew: false },
      status: 'active',
    };

    const allocation: Allocation = {
      allocationId: 'alloc-1',
      offerId: offer.offerId,
      entitlementId: entitlement.entitlementId,
      tenantId: 'tenant-1',
      reservedThroughputMbps: 100,
      reservedBytes: entitlement.quotaBytes,
      startAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      fencingToken: 'fence-1',
      decisionEpoch: 1,
      status: 'reserved',
    };

    await expect(adapter.acquire(offer, entitlement, allocation)).rejects.toThrow('not authorized');
  });

  it('releases acquired capacity', async () => {
    const offers = await adapter.discoverOffers('us-east');
    const offer = getFirstOffer(offers);

    const entitlement: Entitlement = {
      entitlementId: 'ent-1',
      tenantId: 'tenant-1',
      planId: 'plan-1',
      scope: 'bandwidth.mbps.100.region.us-east',
      quotaBytes: 1024 * 1024 * 1024 * 30,
      usedBytes: 0,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      renewal: { autoRenew: false },
      status: 'active',
    };

    const allocation: Allocation = {
      allocationId: 'alloc-1',
      offerId: offer.offerId,
      entitlementId: entitlement.entitlementId,
      tenantId: 'tenant-1',
      reservedThroughputMbps: 100,
      reservedBytes: entitlement.quotaBytes,
      startAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      fencingToken: 'fence-1',
      decisionEpoch: 1,
      status: 'reserved',
    };

    const result = await adapter.acquire(offer, entitlement, allocation);
    const releaseResult = await adapter.release(result.acquisitionId);

    expect(releaseResult.released).toBe(true);
    expect(releaseResult.providerConfirmation).toBe('released-gw-1');

    // Second release should return false
    const secondRelease = await adapter.release(result.acquisitionId);
    expect(secondRelease.released).toBe(false);
  });

  it('verifies acquired resource', async () => {
    const offers = await adapter.discoverOffers('us-east');
    const offer = getFirstOffer(offers);

    const entitlement: Entitlement = {
      entitlementId: 'ent-1',
      tenantId: 'tenant-1',
      planId: 'plan-1',
      scope: 'bandwidth.mbps.100.region.us-east',
      quotaBytes: 1024 * 1024 * 1024 * 30,
      usedBytes: 0,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      renewal: { autoRenew: false },
      status: 'active',
    };

    const allocation: Allocation = {
      allocationId: 'alloc-1',
      offerId: offer.offerId,
      entitlementId: entitlement.entitlementId,
      tenantId: 'tenant-1',
      reservedThroughputMbps: 100,
      reservedBytes: entitlement.quotaBytes,
      startAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      fencingToken: 'fence-1',
      decisionEpoch: 1,
      status: 'reserved',
    };

    const result = await adapter.acquire(offer, entitlement, allocation);
    const verification = await adapter.verify(result.acquisitionId);

    expect(verification.verified).toBe(true);
    expect(verification.egressVerified).toBe(true);
    expect(verification.measuredThroughputMbps).toBe(100);
    expect(verification.latencyMs).toBe(25);
  });

  it('returns failed verification for unknown acquisition', async () => {
    const verification = await adapter.verify('unknown-acq');
    expect(verification.verified).toBe(false);
    expect(verification.failureReason).toBe('acquisition not found');
  });
});