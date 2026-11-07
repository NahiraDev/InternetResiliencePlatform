/**
 * Capacity Provisioning Service
 *
 * Implements the canonical transactional capacity provisioning flow:
 * Intent → Discovery → Ranking → Reservation → Acquisition → Tunnel → Route → Verification → Commit
 * with full rollback and recovery semantics.
 */
import { CapacityOffer, Entitlement, Allocation, AcquisitionAdapter, AcquisitionResult, VerificationResult, UsageLedgerEntry, TunnelConfig } from '@irp/gateway-registry';
export type ProvisioningState = 'REQUESTED' | 'AUTHORIZED' | 'RESERVED' | 'ACQUIRING' | 'PROVISIONED' | 'VERIFIED' | 'ACTIVE' | 'DEGRADED' | 'DRAINING' | 'RELEASED' | 'EXPIRED' | 'REVOKED' | 'FAILED';
export interface ProvisioningSession {
    sessionId: string;
    tenantId: string;
    planId: string;
    state: ProvisioningState;
    offer?: CapacityOffer;
    entitlement?: Entitlement;
    allocation?: Allocation;
    acquisitionResult?: AcquisitionResult;
    tunnelConfig?: TunnelConfig;
    verificationResult?: VerificationResult;
    adapterId?: string;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
    failureReason?: string;
    decisionEpoch: number;
    correlationId: string;
}
export interface ProvisioningRequest {
    tenantId: string;
    planId: string;
    targetThroughputMbps: number;
    durationDays: number;
    region?: string;
    correlationId?: string;
}
export interface EntitlementStore {
    get(entitlementId: string): Promise<Entitlement | undefined>;
    getByTenantAndScope(tenantId: string, scope: string): Promise<Entitlement | undefined>;
    put(entitlement: Entitlement): Promise<void>;
    updateUsage(entitlementId: string, bytesUsed: number): Promise<void>;
}
export interface AllocationStore {
    get(allocationId: string): Promise<Allocation | undefined>;
    put(allocation: Allocation): Promise<void>;
    release(allocationId: string): Promise<void>;
}
export interface UsageLedgerStore {
    append(entry: UsageLedgerEntry): Promise<void>;
    getByAllocation(allocationId: string): Promise<UsageLedgerEntry[]>;
    getTotalUsage(allocationId: string): Promise<{
        bytesIn: number;
        bytesOut: number;
    }>;
}
export interface ProvisioningSessionStore {
    get(sessionId: string): Promise<ProvisioningSession | undefined>;
    put(session: ProvisioningSession): Promise<void>;
}
export interface CapacityProvisioningDependencies {
    entitlementStore: EntitlementStore;
    allocationStore: AllocationStore;
    usageLedgerStore: UsageLedgerStore;
    sessionStore: ProvisioningSessionStore;
    adapters: Map<string, AcquisitionAdapter>;
    establishTunnel: (config: TunnelConfig) => Promise<{
        success: boolean;
        tunnelId: string;
    }>;
    installRoute: (tunnelId: string, destinationPrefix: string) => Promise<boolean>;
    verifyEgress: (tunnelId: string, destination: string) => Promise<VerificationResult>;
    getDecisionEpoch: () => number;
    generateFencingToken: () => string;
}
export declare class CapacityProvisioningService {
    private readonly deps;
    private readonly activeSessions;
    constructor(deps: CapacityProvisioningDependencies);
    /**
     * Start a new capacity provisioning session
     */
    provision(request: ProvisioningRequest): Promise<ProvisioningSession>;
    /**
     * Execute the full provisioning transaction
     */
    private executeProvisioning;
    /**
     * Authorize request and get/create entitlement
     */
    private authorizeAndGetEntitlement;
    /**
     * Discover capacity offers from all adapters
     */
    private discoverOffers;
    /**
     * Select best offer based on cost, trust, latency, failure domain diversity
     */
    private selectBestOffer;
    /**
     * Create allocation reservation
     */
    private createAllocation;
    /**
     * Rollback provisioning on failure
     */
    private rollback;
    /**
     * Handle failure after async execution started
     */
    private handleFailure;
    /**
     * Start usage metering for active session
     */
    private startUsageMetering;
    /**
     * Transition session state
     */
    private transition;
    /**
     * Get session by ID
     */
    getSession(sessionId: string): Promise<ProvisioningSession | undefined>;
    /**
     * Release capacity for a session
     */
    release(sessionId: string): Promise<void>;
}
/**
 * In-memory implementations for testing/development
 */
export declare class InMemoryEntitlementStore implements EntitlementStore {
    private readonly entitlements;
    get(entitlementId: string): Promise<Entitlement | undefined>;
    getByTenantAndScope(tenantId: string, scope: string): Promise<Entitlement | undefined>;
    put(entitlement: Entitlement): Promise<void>;
    updateUsage(entitlementId: string, bytesUsed: number): Promise<void>;
}
export declare class InMemoryAllocationStore implements AllocationStore {
    private readonly allocations;
    get(allocationId: string): Promise<Allocation | undefined>;
    put(allocation: Allocation): Promise<void>;
    release(allocationId: string): Promise<void>;
}
export declare class InMemoryUsageLedgerStore implements UsageLedgerStore {
    private readonly ledger;
    append(entry: UsageLedgerEntry): Promise<void>;
    getByAllocation(allocationId: string): Promise<UsageLedgerEntry[]>;
    getTotalUsage(allocationId: string): Promise<{
        bytesIn: number;
        bytesOut: number;
    }>;
}
export declare class InMemoryProvisioningSessionStore implements ProvisioningSessionStore {
    private readonly sessions;
    get(sessionId: string): Promise<ProvisioningSession | undefined>;
    put(session: ProvisioningSession): Promise<void>;
}
//# sourceMappingURL=capacity-provisioning.d.ts.map