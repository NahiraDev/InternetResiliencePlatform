/**
 * Capacity Contracts Tests
 */

import { describe, it, expect } from 'vitest';
import {
  CapacityOffer,
  Entitlement,
  Allocation,
  UsageLedgerEntry,
  assertCapacityOffer,
  assertEntitlement,
  assertAllocation,
  assertUsageLedgerEntry,
  canEntitlementSatisfy,
  isCapacityOfferFresh,
  isAllocationValid,
  CapacityAcquisitionModel,
} from '../src/capacity-contracts.js';

describe('CapacityOffer', () => {
  const validOffer: CapacityOffer = {
    offerId: 'offer-1',
    providerId: 'provider-1',
    region: 'us-east',
    model: 'provider-api',
    protocols: ['wireguard'],
    throughputClassMbps: 100,
    quotaBytes: 1024 * 1024 * 1024 * 30, // 30 GB
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    termsRef: 'terms/provider-v1',
    trust: 0.9,
    failureDomain: 'fd-us-east-1',
    entitlementScope: 'bandwidth.mbps.100.region.us-east',
    validatedAt: new Date().toISOString(),
    providerMetadata: {},
  };

  it('validates a correct offer', () => {
    expect(() => assertCapacityOffer(validOffer)).not.toThrow();
  });

  it('rejects expired offer', () => {
    const expiredOffer = {
      ...validOffer,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    expect(() => assertCapacityOffer(expiredOffer)).toThrow('expired');
  });

  it('rejects invalid trust score', () => {
    const badOffer = { ...validOffer, trust: 1.5 };
    expect(() => assertCapacityOffer(badOffer)).toThrow('trust must be between 0 and 1');
  });

  it('rejects negative throughput', () => {
    const badOffer = { ...validOffer, throughputClassMbps: -1 };
    expect(() => assertCapacityOffer(badOffer)).toThrow('throughputClassMbps must be positive');
  });

  it('rejects missing required fields', () => {
    const badOffer = { ...validOffer, offerId: '' };
    expect(() => assertCapacityOffer(badOffer)).toThrow('offerId is required');
  });

  it('isCapacityOfferFresh returns true for valid offer', () => {
    expect(isCapacityOfferFresh(validOffer)).toBe(true);
  });

  it('isCapacityOfferFresh returns false for expired offer', () => {
    const expiredOffer = {
      ...validOffer,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    expect(isCapacityOfferFresh(expiredOffer)).toBe(false);
  });
});

describe('Entitlement', () => {
  const validEntitlement: Entitlement = {
    entitlementId: 'ent-1',
    tenantId: 'tenant-1',
    planId: 'plan-1',
    scope: 'bandwidth.mbps.100.region.us-east',
    quotaBytes: 1024 * 1024 * 1024 * 30,
    usedBytes: 1024 * 1024 * 1024 * 10,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    renewal: { autoRenew: false },
    status: 'active',
  };

  it('validates a correct entitlement', () => {
    expect(() => assertEntitlement(validEntitlement)).not.toThrow();
  });

  it('rejects usedBytes exceeding quota', () => {
    const badEnt = { ...validEntitlement, usedBytes: validEntitlement.quotaBytes + 1 };
    expect(() => assertEntitlement(badEnt)).toThrow('usedBytes cannot exceed quotaBytes');
  });

  it('rejects expired entitlement in canEntitlementSatisfy', () => {
    const expiredEnt = { ...validEntitlement, expiresAt: new Date(Date.now() - 1000).toISOString() };
    const result = canEntitlementSatisfy(expiredEnt, 'bandwidth.mbps.100', 1000);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('expired');
  });

  it('rejects exhausted quota in canEntitlementSatisfy', () => {
    const exhaustedEnt = { ...validEntitlement, usedBytes: validEntitlement.quotaBytes };
    const result = canEntitlementSatisfy(exhaustedEnt, 'bandwidth.mbps.100', 1000);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('quota exhausted');
  });

  it('rejects scope mismatch in canEntitlementSatisfy', () => {
    const result = canEntitlementSatisfy(validEntitlement, 'bandwidth.mbps.500', 1000);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('scope mismatch');
  });

  it('allows valid request in canEntitlementSatisfy', () => {
    const result = canEntitlementSatisfy(validEntitlement, 'bandwidth.mbps.100', 1000);
    expect(result.allowed).toBe(true);
  });
});

describe('Allocation', () => {
  const validAllocation: Allocation = {
    allocationId: 'alloc-1',
    offerId: 'offer-1',
    entitlementId: 'ent-1',
    tenantId: 'tenant-1',
    reservedThroughputMbps: 100,
    reservedBytes: 1024 * 1024 * 1024 * 30,
    startAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    fencingToken: 'fence-1',
    decisionEpoch: 1,
    status: 'reserved',
  };

  it('validates a correct allocation', () => {
    expect(() => assertAllocation(validAllocation)).not.toThrow();
  });

  it('rejects non-positive throughput', () => {
    const badAlloc = { ...validAllocation, reservedThroughputMbps: 0 };
    expect(() => assertAllocation(badAlloc)).toThrow('reservedThroughputMbps must be positive');
  });

  it('rejects invalid decisionEpoch', () => {
    const badAlloc = { ...validAllocation, decisionEpoch: -1 };
    expect(() => assertAllocation(badAlloc)).toThrow('decisionEpoch must be a non-negative integer');
  });

  it('isAllocationValid returns true for reserved allocation', () => {
    expect(isAllocationValid(validAllocation)).toBe(true);
  });

  it('isAllocationValid returns true for active allocation', () => {
    const activeAlloc = { ...validAllocation, status: 'active' as const };
    expect(isAllocationValid(activeAlloc)).toBe(true);
  });

  it('isAllocationValid returns false for released allocation', () => {
    const releasedAlloc = { ...validAllocation, status: 'released' as const };
    expect(isAllocationValid(releasedAlloc)).toBe(false);
  });

  it('isAllocationValid returns false for expired allocation', () => {
    const expiredAlloc = { ...validAllocation, expiresAt: new Date(Date.now() - 1000).toISOString() };
    expect(isAllocationValid(expiredAlloc)).toBe(false);
  });
});

describe('UsageLedgerEntry', () => {
  const validEntry: UsageLedgerEntry = {
    entryId: 'usage-1',
    allocationId: 'alloc-1',
    timestamp: new Date().toISOString(),
    bytesOut: 1024 * 1024,
    bytesIn: 512 * 1024,
    windowMs: 60_000,
    source: 'tunnel-counter',
  };

  it('validates a correct entry', () => {
    expect(() => assertUsageLedgerEntry(validEntry)).not.toThrow();
  });

  it('rejects negative bytes', () => {
    const badEntry = { ...validEntry, bytesOut: -1 };
    expect(() => assertUsageLedgerEntry(badEntry)).toThrow('bytesOut must be non-negative');
  });

  it('rejects zero window', () => {
    const badEntry = { ...validEntry, windowMs: 0 };
    expect(() => assertUsageLedgerEntry(badEntry)).toThrow('windowMs must be positive');
  });
});

describe('CapacityAcquisitionModel', () => {
  it('includes all valid models', () => {
    const models: CapacityAcquisitionModel[] = [
      'provider-api',
      'shared-infrastructure',
      'partner-resource',
      'community-gateway',
      'user-owned',
    ];
    expect(models).toHaveLength(5);
  });
});