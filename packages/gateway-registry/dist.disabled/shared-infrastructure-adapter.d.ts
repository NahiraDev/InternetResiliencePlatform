/**
 * Shared Infrastructure Acquisition Adapter
 *
 * This adapter acquires capacity from pre-authorized shared infrastructure
 * (e.g., organization-owned gateways, contracted partner capacity).
 * It demonstrates the AcquisitionAdapter contract with a real implementation.
 */
import { CapacityOffer, Entitlement, Allocation, AcquisitionAdapter, AcquisitionResult, ReleaseResult, VerificationResult, CapacityAcquisitionModel } from './capacity-contracts.js';
export interface SharedInfrastructureConfig {
    /** Adapter identifier */
    adapterId: string;
    /** Pre-authorized gateway IDs this adapter can use */
    authorizedGatewayIds: string[];
    /** Default region */
    region: string;
    /** Default failure domain */
    failureDomain: string;
    /** Terms reference for shared infrastructure */
    termsRef: string;
    /** Default trust score */
    trust: number;
}
/**
 * Shared Infrastructure Acquisition Adapter
 *
 * Acquires capacity from pre-authorized gateway infrastructure.
 * This is a legitimate adapter that uses existing gateway registry capacity.
 */
export declare class SharedInfrastructureAdapter implements AcquisitionAdapter {
    readonly adapterId: string;
    readonly model: CapacityAcquisitionModel;
    private readonly authorizedGatewayIds;
    private readonly region;
    private readonly failureDomain;
    private readonly termsRef;
    private readonly trust;
    private readonly acquisitions;
    constructor(config: SharedInfrastructureConfig);
    /**
     * Discover available offers from authorized gateways
     */
    discoverOffers(region?: string): Promise<CapacityOffer[]>;
    /**
     * Acquire capacity from a shared infrastructure gateway
     */
    acquire(offer: CapacityOffer, entitlement: Entitlement, allocation: Allocation): Promise<AcquisitionResult>;
    /**
     * Release acquired capacity
     */
    release(acquisitionId: string): Promise<ReleaseResult>;
    /**
     * Verify the acquired resource is operational
     */
    verify(acquisitionId: string): Promise<VerificationResult>;
}
/**
 * Factory function to create a SharedInfrastructureAdapter with default config
 */
export declare function createSharedInfrastructureAdapter(config: Partial<SharedInfrastructureConfig> & {
    adapterId: string;
}): SharedInfrastructureAdapter;
//# sourceMappingURL=shared-infrastructure-adapter.d.ts.map