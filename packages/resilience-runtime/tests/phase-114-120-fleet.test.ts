import { describe, expect, it } from 'vitest';
import {
  ConfigRollout, DeviceLifecycleManager, FencingError, FleetHealthError, FleetInventory, FleetInventoryError,
  InMemoryLeaseStore, LeaseCoordinator, LifecycleError, OrchestrationPlanError, TenantIsolationError,
  TenantPartitionedStore, assertSameTenant, cohortPosition, compareVersions, derivePresence, deviceMatches, hashPayload,
  planWaves, runOrchestration, signBundle, summarizeFleetHealth, verifyBundle,
  type DeviceOperationPort, type ManagedDevice,
} from '../src/index.js';

const NOW = Date.parse('2026-10-27T12:00:00.000Z');
const dev = (id: string, o: Partial<ManagedDevice> = {}): ManagedDevice => ({
  deviceId: id, tenantId: 't1', platform: 'linux', agentVersion: '1.2.0', labels: { site: 'a' }, registeredAtMs: NOW - 1_000_000, lastSeenAtMs: NOW - 1000, region: 'eu', ...o,
});

describe('Phase 114 — fleet inventory', () => {
  it('selects by labels, platform, region and version range', () => {
    const inv = new FleetInventory();
    inv.register(dev('a')); inv.register(dev('b', { platform: 'macos', agentVersion: '1.10.0', labels: { site: 'b' } })); inv.register(dev('c', { tenantId: 't2', region: 'us' }));
    expect(inv.select({ tenantId: 't1' }).map((d) => d.deviceId)).toEqual(['a', 'b']);
    expect(inv.select({ labels: { site: 'b' } }).map((d) => d.deviceId)).toEqual(['b']);
    expect(inv.select({ minAgentVersion: '1.5.0' }).map((d) => d.deviceId)).toEqual(['b']);
    expect(inv.select({ regions: ['us'] }).map((d) => d.deviceId)).toEqual(['c']);
    expect(inv.groupBy('platform')).toEqual({ linux: 2, macos: 1 });
    expect(inv.groupBy('label:site', { tenantId: 't1' })).toEqual({ a: 1, b: 1 });
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(deviceMatches(dev('x'), { deviceIds: ['y'] })).toBe(false);
  });
  it('protects tenant ownership, tracks heartbeats and finds stale devices', () => {
    const inv = new FleetInventory();
    inv.register(dev('a', { lastSeenAtMs: NOW - 10 * 60_000 }));
    expect(() => inv.register(dev('a', { tenantId: 'other' }))).toThrow(FleetInventoryError);
    expect(inv.stale(NOW, 5 * 60_000).map((d) => d.deviceId)).toEqual(['a']);
    inv.heartbeat('a', NOW, '1.3.0');
    expect(inv.stale(NOW, 5 * 60_000)).toHaveLength(0);
    expect(inv.get('a')?.agentVersion).toBe('1.3.0');
    expect(() => inv.heartbeat('ghost', NOW)).toThrow(/unknown-device/);
    expect(inv.setLabels('a', { site: 'z' }).labels).toEqual({ site: 'z' });
    expect(inv.remove('a')).toBe(true);
  });
});

describe('Phase 115 — device lifecycle', () => {
  it('requires a trusted identity to activate and a revoked identity to decommission', () => {
    const trusted = new Set<string>();
    const m = new DeviceLifecycleManager({ isIdentityTrusted: (id) => trusted.has(id) });
    m.begin('d', NOW);
    expect(() => m.transition('d', 'active', 'go', NOW)).toThrow(/identity-not-trusted/);
    trusted.add('d');
    m.transition('d', 'active', 'go', NOW);
    expect(m.isOperational('d')).toBe(true);
    m.transition('d', 'maintenance', 'patch', NOW + 1);
    expect(m.isOperational('d')).toBe(false);
    m.transition('d', 'decommissioning', 'retire', NOW + 2);
    expect(() => m.transition('d', 'decommissioned', 'done', NOW + 3)).toThrow(/identity-still-trusted/);
    trusted.delete('d');
    expect(m.transition('d', 'decommissioned', 'done', NOW + 3).state).toBe('decommissioned');
    expect(() => m.transition('d', 'active', 'back', NOW + 4)).toThrow(LifecycleError);
    expect(m.inState('decommissioned')).toEqual(['d']);
    expect(() => m.begin('d', NOW)).toThrow(/already-managed/);
  });
  it('derives presence from heartbeats', () => {
    expect(derivePresence(undefined, NOW)).toBe('never-seen');
    expect(derivePresence(NOW - 1000, NOW)).toBe('online');
    expect(derivePresence(NOW - 5 * 60_000, NOW)).toBe('stale');
    expect(derivePresence(NOW - 30 * 60_000, NOW)).toBe('lost');
  });
});

describe('Phase 116 — config distribution', () => {
  const secret = 'dist-secret';
  const v1 = signBundle(secret, { bundleId: 'cfg', version: 1, kind: 'config', payload: '{"a":1}' });
  const v2 = signBundle(secret, { bundleId: 'cfg', version: 2, kind: 'config', payload: '{"a":2}' });
  const fleet = Array.from({ length: 40 }, (_, i) => dev(`d${String(i).padStart(2, '0')}`));

  it('verifies integrity and signature', () => {
    expect(verifyBundle(secret, v1)).toBe(true);
    expect(verifyBundle(secret, { ...v1, payload: '{"a":9}' })).toBe(false);
    expect(verifyBundle('other', v1)).toBe(false);
    expect(hashPayload('x')).toHaveLength(64);
    expect(() => new ConfigRollout({ ...v2, payload: 'tampered' }, v1, secret, fleet, {})).toThrow(/verification/);
    expect(() => new ConfigRollout(v1, v2, secret, fleet, {})).toThrow(/increase/);
  });
  it('rolls out in stages with deterministic cohorts and completes', () => {
    const r = new ConfigRollout(v2, v1, secret, fleet, {});
    expect(r.targetCount).toBe(40);
    const canary = r.advance();
    expect(canary.length).toBeLessThan(20);
    expect(canary.every((id) => cohortPosition('cfg', 2, id) < 5)).toBe(true);
    expect(r.advance()).toEqual([]);
    for (const id of canary) r.acknowledge(id, 'applied');
    const seen = new Set(canary);
    let guard = 0;
    while (r.currentState !== 'completed' && guard++ < 10) {
      const offered = r.advance();
      for (const id of offered) { expect(seen.has(id)).toBe(false); seen.add(id); r.acknowledge(id, 'applied'); }
    }
    expect(seen.size).toBe(40);
    expect(r.currentState).toBe('completed');
    expect(r.summary().applied).toBe(40);
  });
  it('rolls back everything offered when failures breach the threshold', () => {
    const r = new ConfigRollout(v2, v1, secret, fleet, {}, { stages: [{ name: 'all', percent: 100 }], maxFailureRatio: 0.25, minSampleForFailureRatio: 4 });
    const offered = r.advance();
    expect(offered).toHaveLength(40);
    let reverted: readonly string[] = [];
    for (const id of offered.slice(0, 4)) reverted = r.acknowledge(id, 'failed');
    expect(r.currentState).toBe('rolled-back');
    expect(reverted).toHaveLength(40);
    expect(r.advance()).toEqual([]);
    expect(() => r.acknowledge('d00', 'applied')).toThrow(/not offered/);
  });
  it('halts without a previous bundle and validates stages', () => {
    const r = new ConfigRollout(v1, undefined, secret, fleet, {}, { stages: [{ name: 'all', percent: 100 }], maxFailureRatio: 0.1, minSampleForFailureRatio: 2 });
    const offered = r.advance();
    r.acknowledge(offered[0] as string, 'failed');
    expect(r.acknowledge(offered[1] as string, 'failed')).toEqual([]);
    expect(r.currentState).toBe('halted');
    expect(() => new ConfigRollout(v1, undefined, secret, fleet, {}, { stages: [{ name: 'x', percent: 50 }] })).toThrow(/100 percent/);
  });
});

describe('Phase 117 — distributed coordination', () => {
  it('grants one leader, renews, fails over after expiry and issues increasing fencing tokens', async () => {
    const c = new LeaseCoordinator(new InMemoryLeaseStore(), 10_000);
    const a = await c.acquire('ctl', 'A', NOW);
    expect(a).toMatchObject({ granted: true, reason: 'acquired', lease: { token: 1 } });
    expect(await c.acquire('ctl', 'B', NOW + 1000)).toMatchObject({ granted: false, reason: 'held-by-other' });
    expect(await c.acquire('ctl', 'A', NOW + 5000)).toMatchObject({ granted: true, reason: 'renewed', lease: { token: 1 } });
    const b = await c.acquire('ctl', 'B', NOW + 20_000);
    expect(b).toMatchObject({ granted: true, lease: { token: 2, holder: 'B' } });
    await expect(c.assertFence('ctl', 1, NOW + 20_001)).rejects.toBeInstanceOf(FencingError);
    await expect(c.assertFence('ctl', 2, NOW + 20_001)).resolves.toBeUndefined();
    await expect(c.assertFence('ctl', 2, NOW + 60_000)).rejects.toThrow(/stale fencing/);
    expect(await c.leader('ctl', NOW + 20_001)).toBe('B');
    expect(await c.leader('ctl', NOW + 60_000)).toBeUndefined();
  });
  it('handles lost races and release', async () => {
    const store = new InMemoryLeaseStore();
    const racing = { read: (n: string) => store.read(n), compareAndSet: () => false };
    expect(await new LeaseCoordinator(racing).acquire('x', 'A', NOW)).toMatchObject({ granted: false, reason: 'lost-race' });
    const c = new LeaseCoordinator(store, 10_000);
    await c.acquire('x', 'A', NOW);
    expect(await c.release('x', 'B', NOW + 1)).toBe(false);
    expect(await c.release('x', 'A', NOW + 1)).toBe(true);
    expect(await c.acquire('x', 'B', NOW + 2)).toMatchObject({ granted: true, lease: { token: 2 } });
    expect(() => new LeaseCoordinator(store, 0)).toThrow();
  });
});

describe('Phase 118 — multi-device orchestration', () => {
  const plan = (o: Partial<Parameters<typeof runOrchestration>[0]> = {}) => ({
    planId: 'p', operation: 'apply-config', maxConcurrency: 2, perDeviceTimeoutMs: 200, onFailure: 'continue' as const,
    steps: [{ deviceId: 'core' }, { deviceId: 'edge1', dependsOn: ['core'] }, { deviceId: 'edge2', dependsOn: ['core'] }], ...o,
  });
  it('orders waves by dependency and bounds concurrency', async () => {
    expect(planWaves(plan().steps)).toEqual([['core'], ['edge1', 'edge2']]);
    let active = 0; let peak = 0;
    const port: DeviceOperationPort = { async run() { active += 1; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 5)); active -= 1; return { ok: true }; } };
    const res = await runOrchestration(plan({ maxConcurrency: 1 }), port);
    expect(res.outcome).toBe('completed');
    expect(peak).toBe(1);
    expect(res.results.map((r) => r.deviceId)).toEqual(['core', 'edge1', 'edge2']);
  });
  it('skips dependents of failures, halts on request, times out and aborts', async () => {
    const failCore: DeviceOperationPort = { async run(id) { return { ok: id !== 'core', detail: 'nope' }; } };
    const cont = await runOrchestration(plan(), failCore);
    expect(cont.outcome).toBe('partial');
    expect(cont.results.filter((r) => r.status === 'skipped')).toHaveLength(2);
    const halt = await runOrchestration(plan({ onFailure: 'halt' }), failCore);
    expect(halt.outcome).toBe('halted');
    const slow: DeviceOperationPort = { run: (_id, _op, signal) => new Promise((resolve) => { const t = setTimeout(() => resolve({ ok: true }), 1000); signal.addEventListener('abort', () => clearTimeout(t)); }) };
    const timed = await runOrchestration(plan({ perDeviceTimeoutMs: 20, steps: [{ deviceId: 'x' }] }), slow);
    expect(timed.results[0]?.status).toBe('timed-out');
    const ctl = new AbortController(); ctl.abort();
    expect((await runOrchestration(plan(), failCore, { signal: ctl.signal })).outcome).toBe('aborted');
  });
  it('rejects bad plans and non-operational devices', async () => {
    expect(() => planWaves([{ deviceId: 'a', dependsOn: ['b'] }, { deviceId: 'b', dependsOn: ['a'] }])).toThrow(/cycle/);
    expect(() => planWaves([{ deviceId: 'a', dependsOn: ['zz'] }])).toThrow(OrchestrationPlanError);
    expect(() => planWaves([{ deviceId: 'a' }, { deviceId: 'a' }])).toThrow(/duplicate/);
    await expect(runOrchestration(plan({ maxConcurrency: 0 }), { run: async () => ({ ok: true }) })).rejects.toThrow(/maxConcurrency/);
    const res = await runOrchestration(plan(), { run: async () => ({ ok: true }) }, { isOperational: (id) => id !== 'edge2' });
    expect(res.results.find((r) => r.deviceId === 'edge2')).toMatchObject({ status: 'skipped', detail: 'device-not-operational' });
  });
});

describe('Phase 119 — tenant isolation', () => {
  const a = { tenantId: 'A', principal: 'alice' }; const b = { tenantId: 'B', principal: 'bob' };
  it('partitions data, enforces quotas and audits cross-tenant attempts', () => {
    const store = new TenantPartitionedStore<string>({ maxRecords: 2 }, () => NOW);
    store.put(a, 'k', 'a-value'); store.put(b, 'k', 'b-value');
    expect(store.get(a, 'k')).toBe('a-value');
    expect(store.list(b)).toEqual(['b-value']);
    store.put(a, 'k2', 'x');
    expect(() => store.put(a, 'k3', 'y')).toThrow(TenantIsolationError);
    store.put(a, 'k', 'overwrite-allowed');
    expect(() => store.getForTenant(a, 'B', 'k')).toThrow(/may not read/);
    expect(store.violationLog()).toEqual([{ principal: 'alice', callerTenant: 'A', targetTenant: 'B', operation: 'read', atMs: NOW }]);
    expect(store.getForTenant(a, 'A', 'k2')).toBe('x');
    expect(store.delete(a, 'k2')).toBe(true);
    expect(store.count(a)).toBe(1);
  });
  it('requires a tenant context', () => {
    const store = new TenantPartitionedStore<string>();
    expect(() => store.get({ tenantId: ' ', principal: 'p' }, 'k')).toThrow(/tenant context is required/);
    expect(() => assertSameTenant({ tenantId: 'A', principal: 'p' }, 'A', 'read')).not.toThrow();
  });
});

describe('Phase 120 — fleet health & observability', () => {
  const devices = [dev('a'), dev('b', { agentVersion: '1.0.0' }), dev('c', { lastSeenAtMs: NOW - 3_600_000 }), dev('d', { agentVersion: '3.0.0' })];
  const reports = [
    { deviceId: 'a', status: 'healthy' as const, score: 95, reportedAtMs: NOW - 1000 }, { deviceId: 'b', status: 'degraded' as const, score: 50, reportedAtMs: NOW - 1000 },
    { deviceId: 'c', status: 'healthy' as const, score: 99, reportedAtMs: NOW - 1000 }, { deviceId: 'd', status: 'failed' as const, score: 5, reportedAtMs: NOW - 1000 },
    { deviceId: 'a', status: 'failed' as const, score: 1, reportedAtMs: NOW - 900_000 },
  ];
  it('rolls up availability, degradation, version skew and SLO status', () => {
    const s = summarizeFleetHealth(devices, reports, NOW);
    expect(s).toMatchObject({ tenantId: 't1', total: 4, online: 3, offline: 1, healthy: 1, degraded: 1, failed: 1, unknown: 1 });
    expect(s.availability).toBe(0.75);
    expect(s.versionSkew).toBe(200);
    expect(s.slo.violations).toEqual(['availability-below-slo', 'degraded-ratio-above-slo', 'version-skew-above-slo']);
    expect(s.worst[0]?.deviceId).toBe('c');
  });
  it('is healthy for an empty or good fleet and refuses to mix tenants', () => {
    expect(summarizeFleetHealth([], [], NOW).slo.met).toBe(true);
    expect(() => summarizeFleetHealth([dev('a'), dev('z', { tenantId: 't2' })], [], NOW)).toThrow(FleetHealthError);
    const good = summarizeFleetHealth([dev('a')], [{ deviceId: 'a', status: 'healthy', score: 99, reportedAtMs: NOW }], NOW);
    expect(good.slo.met).toBe(true);
  });
});
