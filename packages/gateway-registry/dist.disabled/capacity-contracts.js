/**
 * Capacity Provisioning Contracts
 *
 * These contracts extend the canonical gateway-registry resource model to support
 * autonomous capacity acquisition, allocation, and provisioning per
 * docs/architecture/autonomous-capacity-provisioning.md
 */
/**
 * Validates a CapacityOffer for freshness and required fields
 */
export function assertCapacityOffer(offer) {
    if (!offer.offerId.trim())
        throw new Error('offerId is required');
    if (!offer.providerId.trim())
        throw new Error('providerId is required');
    if (!offer.region.trim())
        throw new Error('region is required');
    if (offer.throughputClassMbps <= 0)
        throw new Error('throughputClassMbps must be positive');
    if (offer.quotaBytes < 0)
        throw new Error('quotaBytes must be non-negative');
    if (!offer.expiresAt.trim())
        throw new Error('expiresAt is required');
    if (!offer.termsRef.trim())
        throw new Error('termsRef is required');
    if (offer.trust < 0 || offer.trust > 1)
        throw new Error('trust must be between 0 and 1');
    if (!offer.failureDomain.trim())
        throw new Error('failureDomain is required');
    if (!offer.entitlementScope.trim())
        throw new Error('entitlementScope is required');
    if (!offer.validatedAt.trim())
        throw new Error('validatedAt is required');
    const expires = new Date(offer.expiresAt);
    if (isNaN(expires.getTime()))
        throw new Error('expiresAt must be valid ISO 8601');
    const validated = new Date(offer.validatedAt);
    if (isNaN(validated.getTime()))
        throw new Error('validatedAt must be valid ISO 8601');
    if (expires <= new Date())
        throw new Error('offer has expired');
}
/**
 * Checks if a CapacityOffer is fresh (not expired)
 */
export function isCapacityOfferFresh(offer, now = new Date()) {
    return new Date(offer.expiresAt) > now;
}
/**
 * Validates an Entitlement
 */
export function assertEntitlement(entitlement) {
    if (!entitlement.entitlementId.trim())
        throw new Error('entitlementId is required');
    if (!entitlement.tenantId.trim())
        throw new Error('tenantId is required');
    if (!entitlement.planId.trim())
        throw new Error('planId is required');
    if (!entitlement.scope.trim())
        throw new Error('scope is required');
    if (entitlement.quotaBytes < 0)
        throw new Error('quotaBytes must be non-negative');
    if (entitlement.usedBytes < 0)
        throw new Error('usedBytes must be non-negative');
    if (!entitlement.expiresAt.trim())
        throw new Error('expiresAt is required');
    if (entitlement.usedBytes > entitlement.quotaBytes && entitlement.quotaBytes > 0) {
        throw new Error('usedBytes cannot exceed quotaBytes');
    }
}
/**
 * Checks if an Entitlement can satisfy a request
 */
export function canEntitlementSatisfy(entitlement, requestScope, requestBytes) {
    if (entitlement.status !== 'active') {
        return { allowed: false, reason: `entitlement status: ${entitlement.status}` };
    }
    if (new Date(entitlement.expiresAt) <= new Date()) {
        return { allowed: false, reason: 'entitlement expired' };
    }
    if (!entitlement.scope.includes(requestScope)) {
        return { allowed: false, reason: `scope mismatch: ${entitlement.scope} does not cover ${requestScope}` };
    }
    const remaining = entitlement.quotaBytes > 0 ? entitlement.quotaBytes - entitlement.usedBytes : Infinity;
    if (requestBytes > remaining) {
        return { allowed: false, reason: `quota exhausted: ${remaining} bytes remaining` };
    }
    return { allowed: true };
}
/**
 * Validates an Allocation
 */
export function assertAllocation(allocation) {
    if (!allocation.allocationId.trim())
        throw new Error('allocationId is required');
    if (!allocation.offerId.trim())
        throw new Error('offerId is required');
    if (!allocation.entitlementId.trim())
        throw new Error('entitlementId is required');
    if (!allocation.tenantId.trim())
        throw new Error('tenantId is required');
    if (allocation.reservedThroughputMbps <= 0)
        throw new Error('reservedThroughputMbps must be positive');
    if (allocation.reservedBytes < 0)
        throw new Error('reservedBytes must be non-negative');
    if (!allocation.startAt.trim())
        throw new Error('startAt is required');
    if (!allocation.expiresAt.trim())
        throw new Error('expiresAt is required');
    if (!allocation.fencingToken.trim())
        throw new Error('fencingToken is required');
    if (!Number.isInteger(allocation.decisionEpoch) || allocation.decisionEpoch < 0) {
        throw new Error('decisionEpoch must be a non-negative integer');
    }
}
/**
 * Checks if an Allocation is still valid (not expired)
 */
export function isAllocationValid(allocation, now = new Date()) {
    return (allocation.status === 'reserved' || allocation.status === 'active')
        && new Date(allocation.expiresAt) > now;
}
/**
 * Validates a UsageLedgerEntry
 */
export function assertUsageLedgerEntry(entry) {
    if (!entry.entryId.trim())
        throw new Error('entryId is required');
    if (!entry.allocationId.trim())
        throw new Error('allocationId is required');
    if (!entry.timestamp.trim())
        throw new Error('timestamp is required');
    if (entry.bytesOut < 0)
        throw new Error('bytesOut must be non-negative');
    if (entry.bytesIn < 0)
        throw new Error('bytesIn must be non-negative');
    if (entry.windowMs <= 0)
        throw new Error('windowMs must be positive');
}
//# sourceMappingURL=capacity-contracts.js.map