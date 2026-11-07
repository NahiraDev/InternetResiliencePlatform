/**
 * Phase 119 — Tenant / Organization Isolation.
 *
 * Tenant-partitioned storage with mandatory tenant context, cross-tenant access
 * denial that is audited, per-tenant quotas and a guard that fails closed when
 * a record's tenant does not match the caller's. No API returns data across
 * tenants; there is no "all tenants" read.
 */
export class TenantIsolationError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'TenantIsolationError';
    }
}
const requireTenant = (ctx) => {
    if (!ctx || !ctx.tenantId.trim())
        throw new TenantIsolationError('tenant-required', 'a tenant context is required');
    return ctx;
};
/** Asserts a record belongs to the caller's tenant; records and audits the violation otherwise. */
export const assertSameTenant = (ctx, recordTenantId, operation, audit, nowMs = Date.now()) => {
    requireTenant(ctx);
    if (ctx.tenantId !== recordTenantId) {
        audit?.({ principal: ctx.principal, callerTenant: ctx.tenantId, targetTenant: recordTenantId, operation, atMs: nowMs });
        throw new TenantIsolationError('cross-tenant-access', `tenant ${ctx.tenantId} may not ${operation} data of tenant ${recordTenantId}`);
    }
};
export class TenantPartitionedStore {
    quota;
    clock;
    partitions = new Map();
    violations = [];
    constructor(quota = { maxRecords: 10_000 }, clock = () => Date.now()) {
        this.quota = quota;
        this.clock = clock;
        if (quota.maxRecords < 1)
            throw new Error('quota must allow at least one record');
    }
    part(ctx) {
        const t = requireTenant(ctx).tenantId;
        let p = this.partitions.get(t);
        if (!p) {
            p = new Map();
            this.partitions.set(t, p);
        }
        return p;
    }
    put(ctx, key, value) {
        const p = this.part(ctx);
        if (!p.has(key) && p.size >= this.quota.maxRecords)
            throw new TenantIsolationError('quota-exceeded', `tenant ${ctx.tenantId} reached its quota of ${this.quota.maxRecords}`);
        p.set(key, value);
    }
    get(ctx, key) { return this.part(ctx).get(key); }
    delete(ctx, key) { return this.part(ctx).delete(key); }
    list(ctx) { return Object.freeze([...this.part(ctx).values()]); }
    count(ctx) { return this.part(ctx).size; }
    /** Cross-tenant addressing is never possible by key; a request naming another tenant is denied and audited. */
    getForTenant(ctx, targetTenantId, key) {
        assertSameTenant(ctx, targetTenantId, 'read', (v) => this.violations.push(v), this.clock());
        return this.get(ctx, key);
    }
    violationLog() { return Object.freeze([...this.violations]); }
}
//# sourceMappingURL=tenant-isolation.js.map