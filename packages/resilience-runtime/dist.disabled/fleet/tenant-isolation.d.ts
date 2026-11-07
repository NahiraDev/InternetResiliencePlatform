/**
 * Phase 119 — Tenant / Organization Isolation.
 *
 * Tenant-partitioned storage with mandatory tenant context, cross-tenant access
 * denial that is audited, per-tenant quotas and a guard that fails closed when
 * a record's tenant does not match the caller's. No API returns data across
 * tenants; there is no "all tenants" read.
 */
export declare class TenantIsolationError extends Error {
    readonly code: 'tenant-required' | 'cross-tenant-access' | 'quota-exceeded' | 'unknown-tenant';
    constructor(code: 'tenant-required' | 'cross-tenant-access' | 'quota-exceeded' | 'unknown-tenant', message: string);
}
export interface TenantContext {
    readonly tenantId: string;
    readonly principal: string;
}
export interface TenantQuota {
    readonly maxRecords: number;
}
export interface IsolationViolation {
    readonly principal: string;
    readonly callerTenant: string;
    readonly targetTenant: string;
    readonly operation: string;
    readonly atMs: number;
}
/** Asserts a record belongs to the caller's tenant; records and audits the violation otherwise. */
export declare const assertSameTenant: (ctx: TenantContext, recordTenantId: string, operation: string, audit?: (v: IsolationViolation) => void, nowMs?: number) => void;
export declare class TenantPartitionedStore<T> {
    private readonly quota;
    private readonly clock;
    private readonly partitions;
    private readonly violations;
    constructor(quota?: TenantQuota, clock?: () => number);
    private part;
    put(ctx: TenantContext, key: string, value: T): void;
    get(ctx: TenantContext, key: string): T | undefined;
    delete(ctx: TenantContext, key: string): boolean;
    list(ctx: TenantContext): readonly T[];
    count(ctx: TenantContext): number;
    /** Cross-tenant addressing is never possible by key; a request naming another tenant is denied and audited. */
    getForTenant(ctx: TenantContext, targetTenantId: string, key: string): T | undefined;
    violationLog(): readonly IsolationViolation[];
}
//# sourceMappingURL=tenant-isolation.d.ts.map