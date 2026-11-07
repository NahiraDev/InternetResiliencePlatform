/**
 * Capacity Provisioning Contracts
 *
 * These contracts extend the canonical gateway-registry resource model to support
 * autonomous capacity acquisition, allocation, and provisioning per
 * docs/architecture/autonomous-capacity-provisioning.md
 */
import type { GatewayEndpoint } from './index.js';
export type { GatewayEndpoint };
/**
 * Acquisition model for capacity
 */
export type CapacityAcquisitionModel = 'provider-api' | 'shared-infrastructure' | 'partner-resource' | 'community-gateway' | 'user-owned';
/**
 * Capacity offer from a provider or authorized source
 */
export interface CapacityOffer {
    /** Unique offer identifier */
    offerId: string;
    /** Provider identifier (canonical providerId) */
    providerId: string;
    /** Region where capacity is available */
    region: string;
    /** Country code (ISO 3166-1 alpha-2) */
    countryCode?: string;
    /** Acquisition model */
    model: CapacityAcquisitionModel;
    /** Supported tunnel protocols */
    protocols: string[];
    /** Throughput class in Mbps (guaranteed minimum) */
    throughputClassMbps: number;
    /** Maximum burst throughput in Mbps */
    burstThroughputMbps?: number;
    /** Quota: total bytes available (0 = unlimited) */
    quotaBytes: number;
    /** Offer expiry timestamp (ISO 8601) */
    expiresAt: string;
    /** Cost model reference (terms URL or identifier) */
    termsRef: string;
    /** Trust score (0-1) */
    trust: number;
    /** Failure domain identifier */
    failureDomain: string;
    /** Entitlement scope this offer satisfies */
    entitlementScope: string;
    /** Freshness: when this offer was last validated */
    validatedAt: string;
    /** Provider-specific metadata */
    providerMetadata: Record<string, unknown>;
}
/**
 * Validates a CapacityOffer for freshness and required fields
 */
export declare function assertCapacityOffer(offer: CapacityOffer): void;
/**
 * Checks if a CapacityOffer is fresh (not expired)
 */
export declare function isCapacityOfferFresh(offer: CapacityOffer, now?: Date): boolean;
/**
 * Entitlement: what a tenant/user may consume
 */
export interface Entitlement {
    /** Unique entitlement identifier */
    entitlementId: string;
    /** Tenant/organization identifier */
    tenantId: string;
    /** Plan identifier this entitlement belongs to */
    planId: string;
    /** Scope of this entitlement (e.g., "bandwidth.mbps.25", "egress.region.us") */
    scope: string;
    /** Maximum quota in bytes (0 = unlimited within scope) */
    quotaBytes: number;
    /** Current usage in bytes */
    usedBytes: number;
    /** Entitlement expiry timestamp (ISO 8601) */
    expiresAt: string;
    /** Renewal rules */
    renewal: {
        autoRenew: boolean;
        renewalWindowDays?: number;
    };
    /** Status */
    status: 'active' | 'exhausted' | 'expired' | 'revoked';
}
/**
 * Validates an Entitlement
 */
export declare function assertEntitlement(entitlement: Entitlement): void;
/**
 * Checks if an Entitlement can satisfy a request
 */
export declare function canEntitlementSatisfy(entitlement: Entitlement, requestScope: string, requestBytes: number): {
    allowed: boolean;
    reason?: string;
};
/**
 * Allocation: a reservation of capacity to an intent/session
 */
export interface Allocation {
    /** Unique allocation identifier */
    allocationId: string;
    /** Associated offer */
    offerId: string;
    /** Entitlement this allocation consumes */
    entitlementId: string;
    /** Tenant identifier */
    tenantId: string;
    /** Reserved throughput in Mbps */
    reservedThroughputMbps: number;
    /** Reserved quota in bytes */
    reservedBytes: number;
    /** Allocation start timestamp */
    startAt: string;
    /** Allocation expiry timestamp (TTL) */
    expiresAt: string;
    /** Fencing token for exclusive access */
    fencingToken: string;
    /** Decision epoch this allocation belongs to */
    decisionEpoch: number;
    /** Status */
    status: 'reserved' | 'active' | 'draining' | 'released' | 'expired';
}
/**
 * Validates an Allocation
 */
export declare function assertAllocation(allocation: Allocation): void;
/**
 * Checks if an Allocation is still valid (not expired)
 */
export declare function isAllocationValid(allocation: Allocation, now?: Date): boolean;
/**
 * Usage ledger entry: metered consumption per allocation
 */
export interface UsageLedgerEntry {
    /** Unique entry identifier */
    entryId: string;
    /** Allocation this entry belongs to */
    allocationId: string;
    /** Timestamp of measurement */
    timestamp: string;
    /** Bytes sent through the provisioned path */
    bytesOut: number;
    /** Bytes received through the provisioned path */
    bytesIn: number;
    /** Measurement window in milliseconds */
    windowMs: number;
    /** Source of measurement */
    source: 'tunnel-counter' | 'flow-accounting' | 'provider-report';
}
/**
 * Validates a UsageLedgerEntry
 */
export declare function assertUsageLedgerEntry(entry: UsageLedgerEntry): void;
/**
 * Acquisition Adapter interface: external boundary for acquiring capacity
 */
export interface AcquisitionAdapter {
    /** Adapter identifier */
    readonly adapterId: string;
    /** Acquisition model this adapter handles */
    readonly model: CapacityAcquisitionModel;
    /**
     * Discover available offers from this adapter's source
     */
    discoverOffers(region?: string): Promise<CapacityOffer[]>;
    /**
     * Acquire (order/allocate/activate) a specific offer
     * Returns acquisition details including provider resource ID and credentials reference
     */
    acquire(offer: CapacityOffer, entitlement: Entitlement, allocation: Allocation): Promise<AcquisitionResult>;
    /**
     * Release an acquired resource
     */
    release(acquisitionId: string): Promise<ReleaseResult>;
    /**
     * Verify the acquired resource is operational
     */
    verify(acquisitionId: string): Promise<VerificationResult>;
}
/**
 * Result of an acquisition attempt
 */
export interface AcquisitionResult {
    /** Unique acquisition identifier */
    acquisitionId: string;
    /** Provider resource identifier */
    providerResourceId: string;
    /** Credentials reference (opaque, adapter-managed) */
    credentialsRef: string;
    /** Tunnel configuration */
    tunnelConfig: TunnelConfig;
    /** Acquired timestamp */
    acquiredAt: string;
    /** Provider-specific metadata */
    providerMetadata: Record<string, unknown>;
}
/**
 * Result of a release attempt
 */
export interface ReleaseResult {
    /** Whether release was successful */
    released: boolean;
    /** Provider release confirmation (if available) */
    providerConfirmation?: string;
    /** Released timestamp */
    releasedAt: string;
}
/**
 * Result of a verification attempt
 */
export interface VerificationResult {
    /** Whether verification passed */
    verified: boolean;
    /** External destination verification evidence */
    egressVerified: boolean;
    /** Measured throughput in Mbps */
    measuredThroughputMbps?: number;
    /** Latency in ms */
    latencyMs?: number;
    /** Verification timestamp */
    verifiedAt: string;
    /** Failure reason if not verified */
    failureReason?: string;
}
/**
 * Tunnel configuration for acquired capacity
 */
export interface TunnelConfig {
    /** Tunnel protocol */
    protocol: 'wireguard' | 'openvpn' | 'ipsec' | 'custom';
    /** Local endpoint */
    localEndpoint: GatewayEndpoint;
    /** Remote endpoint */
    remoteEndpoint: GatewayEndpoint;
    /** Tunnel-specific parameters */
    parameters: Record<string, unknown>;
}
/**
 * Bandwidth plan: user-facing package
 */
export interface BandwidthPlan {
    /** Plan identifier */
    planId: string;
    /** Human-readable name */
    name: string;
    /** Description */
    description: string;
    /** Target throughput in Mbps */
    targetThroughputMbps: number;
    /** Duration in days */
    durationDays: number;
    /** Price reference */
    priceRef: string;
    /** Entitlement scopes this plan provides */
    entitlementScopes: string[];
    /** Eligible regions */
    regions: string[];
    /** Whether plan is active */
    active: boolean;
}
//# sourceMappingURL=capacity-contracts.d.ts.map