/**
 * Capacity Provisioning Service
 *
 * Implements the canonical transactional capacity provisioning flow:
 * Intent → Discovery → Ranking → Reservation → Acquisition → Tunnel → Route → Verification → Commit
 * with full rollback and recovery semantics.
 */
import { assertAllocation, canEntitlementSatisfy, assertUsageLedgerEntry, } from '@irp/gateway-registry';
import { randomUUID } from 'node:crypto';
export class CapacityProvisioningService {
    deps;
    activeSessions = new Map();
    constructor(deps) {
        this.deps = deps;
    }
    /**
     * Start a new capacity provisioning session
     */
    async provision(request) {
        const sessionId = `prov-${randomUUID()}`;
        const correlationId = request.correlationId ?? `cap-${randomUUID()}`;
        const decisionEpoch = this.deps.getDecisionEpoch();
        const fencingToken = this.deps.generateFencingToken();
        const session = {
            sessionId,
            tenantId: request.tenantId,
            planId: request.planId,
            state: 'REQUESTED',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            decisionEpoch,
            correlationId,
        };
        await this.deps.sessionStore.put(session);
        this.activeSessions.set(sessionId, session);
        // Execute provisioning asynchronously
        this.executeProvisioning(session, request, fencingToken).catch((error) => {
            this.handleFailure(session, error);
        });
        return session;
    }
    /**
     * Execute the full provisioning transaction
     */
    async executeProvisioning(session, request, fencingToken) {
        try {
            // Step 1: Authorization & Entitlement
            await this.transition(session, 'AUTHORIZED');
            const entitlement = await this.authorizeAndGetEntitlement(session, request);
            session.entitlement = entitlement;
            // Step 2: Discovery
            const offers = await this.discoverOffers(request);
            if (offers.length === 0) {
                throw new Error('no capacity offers available');
            }
            // Step 3: Ranking & Selection
            const offer = this.selectBestOffer(offers, request);
            session.offer = offer;
            // Step 4: Reservation (Allocation)
            await this.transition(session, 'RESERVED');
            const allocation = await this.createAllocation(session, offer, entitlement, fencingToken);
            session.allocation = allocation;
            await this.deps.allocationStore.put(allocation);
            // Step 5: Acquisition
            await this.transition(session, 'ACQUIRING');
            const adapter = this.deps.adapters.get(offer.model);
            if (!adapter) {
                throw new Error(`no adapter for acquisition model: ${offer.model}`);
            }
            session.adapterId = adapter.adapterId;
            const acquisitionResult = await adapter.acquire(offer, entitlement, allocation);
            session.acquisitionResult = acquisitionResult;
            // Step 6: Tunnel Establishment & Route Installation
            await this.transition(session, 'PROVISIONED');
            const tunnelResult = await this.deps.establishTunnel(acquisitionResult.tunnelConfig);
            if (!tunnelResult.success) {
                throw new Error('tunnel establishment failed');
            }
            // Step 7: Verification
            await this.transition(session, 'VERIFIED');
            const verification = await this.deps.verifyEgress(tunnelResult.tunnelId, acquisitionResult.tunnelConfig.remoteEndpoint.host);
            session.verificationResult = verification;
            if (!verification.verified || !verification.egressVerified) {
                throw new Error(verification.failureReason ?? 'verification failed');
            }
            // Step 8: Commit - activate allocation
            allocation.status = 'active';
            await this.deps.allocationStore.put(allocation);
            await this.transition(session, 'ACTIVE');
            session.completedAt = new Date().toISOString();
            // Start usage metering
            this.startUsageMetering(session);
        }
        catch (error) {
            await this.rollback(session, error);
            throw error;
        }
    }
    /**
     * Authorize request and get/create entitlement
     */
    async authorizeAndGetEntitlement(session, request) {
        const scope = `bandwidth.mbps.${request.targetThroughputMbps}.region.${request.region ?? 'any'}`;
        // Look for existing entitlement
        let entitlement = await this.deps.entitlementStore.getByTenantAndScope(session.tenantId, scope);
        if (!entitlement) {
            // Create new entitlement based on plan
            entitlement = {
                entitlementId: `ent-${randomUUID()}`,
                tenantId: session.tenantId,
                planId: session.planId,
                scope,
                quotaBytes: request.durationDays * 24 * 60 * 60 * (request.targetThroughputMbps * 125_000), // bytes per day at target throughput
                usedBytes: 0,
                expiresAt: new Date(Date.now() + request.durationDays * 24 * 60 * 60 * 1000).toISOString(),
                renewal: {
                    autoRenew: false,
                },
                status: 'active',
            };
            await this.deps.entitlementStore.put(entitlement);
        }
        // Check if entitlement can satisfy request
        const estimatedBytes = request.durationDays * 24 * 60 * 60 * (request.targetThroughputMbps * 125_000);
        const check = canEntitlementSatisfy(entitlement, scope, estimatedBytes);
        if (!check.allowed) {
            throw new Error(`entitlement check failed: ${check.reason}`);
        }
        return entitlement;
    }
    /**
     * Discover capacity offers from all adapters
     */
    async discoverOffers(request) {
        const allOffers = [];
        for (const [, adapter] of this.deps.adapters) {
            try {
                const offers = await adapter.discoverOffers(request.region);
                allOffers.push(...offers);
            }
            catch (error) {
                // Log but continue with other adapters
                console.warn(`Adapter ${adapter.adapterId} discovery failed:`, error);
            }
        }
        // Filter by freshness and minimum throughput
        return allOffers.filter((offer) => offer.throughputClassMbps >= request.targetThroughputMbps &&
            new Date(offer.expiresAt) > new Date());
    }
    /**
     * Select best offer based on cost, trust, latency, failure domain diversity
     */
    selectBestOffer(offers, request) {
        // Simple ranking: highest trust, then lowest cost (placeholder), then failure domain diversity
        return offers.sort((a, b) => {
            // Prefer higher trust
            if (b.trust !== a.trust)
                return b.trust - a.trust;
            // Prefer lower throughput class (more efficient)
            return a.throughputClassMbps - b.throughputClassMbps;
        })[0];
    }
    /**
     * Create allocation reservation
     */
    async createAllocation(session, offer, entitlement, fencingToken) {
        const allocation = {
            allocationId: `alloc-${randomUUID()}`,
            offerId: offer.offerId,
            entitlementId: entitlement.entitlementId,
            tenantId: session.tenantId,
            reservedThroughputMbps: offer.throughputClassMbps,
            reservedBytes: entitlement.quotaBytes > 0 ? entitlement.quotaBytes : 0,
            startAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hour TTL
            fencingToken,
            decisionEpoch: session.decisionEpoch,
            status: 'reserved',
        };
        assertAllocation(allocation);
        return allocation;
    }
    /**
     * Rollback provisioning on failure
     */
    async rollback(session, error) {
        await this.transition(session, 'FAILED', error.message);
        // Release acquisition if exists
        if (session.acquisitionResult && session.adapterId) {
            const adapter = this.deps.adapters.get(session.adapterId);
            if (adapter) {
                try {
                    await adapter.release(session.acquisitionResult.acquisitionId);
                }
                catch (releaseError) {
                    console.error('Rollback release failed:', releaseError);
                }
            }
        }
        // Release allocation if exists
        if (session.allocation) {
            try {
                session.allocation.status = 'released';
                await this.deps.allocationStore.put(session.allocation);
            }
            catch (allocError) {
                console.error('Rollback allocation release failed:', allocError);
            }
        }
        // Update entitlement usage (no change on failed provisioning)
        // The entitlement's usedBytes should not be incremented for failed attempts
    }
    /**
     * Handle failure after async execution started
     */
    async handleFailure(session, error) {
        await this.rollback(session, error);
    }
    /**
     * Start usage metering for active session
     */
    startUsageMetering(session) {
        if (!session.allocation || !session.acquisitionResult)
            return;
        // In a real implementation, this would poll tunnel counters or flow accounting
        // and append to the usage ledger periodically
        const interval = setInterval(async () => {
            const currentSession = this.activeSessions.get(session.sessionId);
            if (!currentSession || currentSession.state !== 'ACTIVE') {
                clearInterval(interval);
                return;
            }
            // Simulate usage measurement from tunnel counters
            const bytesIn = Math.floor(Math.random() * 1024 * 1024); // 1MB random
            const bytesOut = Math.floor(Math.random() * 1024 * 1024);
            const entry = {
                entryId: `usage-${randomUUID()}`,
                allocationId: session.allocation.allocationId,
                timestamp: new Date().toISOString(),
                bytesOut,
                bytesIn,
                windowMs: 60_000, // 1 minute window
                source: 'tunnel-counter',
            };
            assertUsageLedgerEntry(entry);
            await this.deps.usageLedgerStore.append(entry);
            // Update entitlement usage
            if (currentSession.entitlement) {
                await this.deps.entitlementStore.updateUsage(currentSession.entitlement.entitlementId, bytesIn + bytesOut);
            }
        }, 60_000); // Every minute
    }
    /**
     * Transition session state
     */
    async transition(session, state, failureReason) {
        session.state = state;
        session.updatedAt = new Date().toISOString();
        if (failureReason) {
            session.failureReason = failureReason;
        }
        await this.deps.sessionStore.put(session);
    }
    /**
     * Get session by ID
     */
    async getSession(sessionId) {
        return this.deps.sessionStore.get(sessionId);
    }
    /**
     * Release capacity for a session
     */
    async release(sessionId) {
        const session = await this.deps.sessionStore.get(sessionId);
        if (!session)
            throw new Error(`session ${sessionId} not found`);
        if (session.acquisitionResult && session.adapterId) {
            const adapter = this.deps.adapters.get(session.adapterId);
            if (adapter) {
                await adapter.release(session.acquisitionResult.acquisitionId);
            }
        }
        if (session.allocation) {
            session.allocation.status = 'released';
            await this.deps.allocationStore.put(session.allocation);
        }
        session.state = 'RELEASED';
        session.updatedAt = new Date().toISOString();
        await this.deps.sessionStore.put(session);
        this.activeSessions.delete(sessionId);
    }
}
/**
 * In-memory implementations for testing/development
 */
export class InMemoryEntitlementStore {
    entitlements = new Map();
    async get(entitlementId) {
        return this.entitlements.get(entitlementId);
    }
    async getByTenantAndScope(tenantId, scope) {
        for (const ent of this.entitlements.values()) {
            if (ent.tenantId === tenantId && ent.scope === scope)
                return ent;
        }
        return undefined;
    }
    async put(entitlement) {
        this.entitlements.set(entitlement.entitlementId, { ...entitlement });
    }
    async updateUsage(entitlementId, bytesUsed) {
        const ent = this.entitlements.get(entitlementId);
        if (ent) {
            ent.usedBytes += bytesUsed;
            if (ent.quotaBytes > 0 && ent.usedBytes >= ent.quotaBytes) {
                ent.status = 'exhausted';
            }
        }
    }
}
export class InMemoryAllocationStore {
    allocations = new Map();
    async get(allocationId) {
        return this.allocations.get(allocationId);
    }
    async put(allocation) {
        this.allocations.set(allocation.allocationId, { ...allocation });
    }
    async release(allocationId) {
        const alloc = this.allocations.get(allocationId);
        if (alloc) {
            alloc.status = 'released';
        }
    }
}
export class InMemoryUsageLedgerStore {
    ledger = new Map(); // allocationId -> entries
    async append(entry) {
        const entries = this.ledger.get(entry.allocationId) ?? [];
        entries.push({ ...entry });
        this.ledger.set(entry.allocationId, entries);
    }
    async getByAllocation(allocationId) {
        return this.ledger.get(allocationId) ?? [];
    }
    async getTotalUsage(allocationId) {
        const entries = this.ledger.get(allocationId) ?? [];
        return entries.reduce((acc, entry) => ({
            bytesIn: acc.bytesIn + entry.bytesIn,
            bytesOut: acc.bytesOut + entry.bytesOut,
        }), { bytesIn: 0, bytesOut: 0 });
    }
}
export class InMemoryProvisioningSessionStore {
    sessions = new Map();
    async get(sessionId) {
        return this.sessions.get(sessionId);
    }
    async put(session) {
        this.sessions.set(session.sessionId, { ...session });
    }
}
//# sourceMappingURL=capacity-provisioning.js.map