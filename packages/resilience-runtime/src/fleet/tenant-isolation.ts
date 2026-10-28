/**
 * Phase 119 — Tenant / Organization Isolation.
 *
 * Tenant-partitioned storage with mandatory tenant context, cross-tenant access
 * denial that is audited, per-tenant quotas and a guard that fails closed when
 * a record's tenant does not match the caller's. No API returns data across
 * tenants; there is no "all tenants" read.
 */

export class TenantIsolationError extends Error {
  constructor(readonly code: 'tenant-required' | 'cross-tenant-access' | 'quota-exceeded' | 'unknown-tenant', message: string) {
    super(message); this.name = 'TenantIsolationError';
  }
}

export interface TenantContext { readonly tenantId: string; readonly principal: string }

export interface TenantQuota { readonly maxRecords: number }

export interface IsolationViolation { readonly principal: string; readonly callerTenant: string; readonly targetTenant: string; readonly operation: string; readonly atMs: number }

const requireTenant = (ctx: TenantContext | undefined): TenantContext => {
  if (!ctx || !ctx.tenantId.trim()) throw new TenantIsolationError('tenant-required', 'a tenant context is required');
  return ctx;
};

/** Asserts a record belongs to the caller's tenant; records and audits the violation otherwise. */
export const assertSameTenant = (ctx: TenantContext, recordTenantId: string, operation: string, audit?: (v: IsolationViolation) => void, nowMs: number = Date.now()): void => {
  requireTenant(ctx);
  if (ctx.tenantId !== recordTenantId) {
    audit?.({ principal: ctx.principal, callerTenant: ctx.tenantId, targetTenant: recordTenantId, operation, atMs: nowMs });
    throw new TenantIsolationError('cross-tenant-access', `tenant ${ctx.tenantId} may not ${operation} data of tenant ${recordTenantId}`);
  }
};

export class TenantPartitionedStore<T> {
  private readonly partitions = new Map<string, Map<string, T>>();
  private readonly violations: IsolationViolation[] = [];
  constructor(private readonly quota: TenantQuota = { maxRecords: 10_000 }, private readonly clock: () => number = () => Date.now()) {
    if (quota.maxRecords < 1) throw new Error('quota must allow at least one record');
  }

  private part(ctx: TenantContext): Map<string, T> {
    const t = requireTenant(ctx).tenantId;
    let p = this.partitions.get(t);
    if (!p) { p = new Map(); this.partitions.set(t, p); }
    return p;
  }

  put(ctx: TenantContext, key: string, value: T): void {
    const p = this.part(ctx);
    if (!p.has(key) && p.size >= this.quota.maxRecords) throw new TenantIsolationError('quota-exceeded', `tenant ${ctx.tenantId} reached its quota of ${this.quota.maxRecords}`);
    p.set(key, value);
  }
  get(ctx: TenantContext, key: string): T | undefined { return this.part(ctx).get(key); }
  delete(ctx: TenantContext, key: string): boolean { return this.part(ctx).delete(key); }
  list(ctx: TenantContext): readonly T[] { return Object.freeze([...this.part(ctx).values()]); }
  count(ctx: TenantContext): number { return this.part(ctx).size; }

  /** Cross-tenant addressing is never possible by key; a request naming another tenant is denied and audited. */
  getForTenant(ctx: TenantContext, targetTenantId: string, key: string): T | undefined {
    assertSameTenant(ctx, targetTenantId, 'read', (v) => this.violations.push(v), this.clock());
    return this.get(ctx, key);
  }

  violationLog(): readonly IsolationViolation[] { return Object.freeze([...this.violations]); }
}
