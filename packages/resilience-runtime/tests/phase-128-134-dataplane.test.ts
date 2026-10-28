import { describe, expect, it } from 'vitest';
import {
  AddressManager, AddressPoolError, FirewallLockoutError, FlowTable, allocateBandwidth, analyzeRules, applyDataPlanePlan, assertSafeRuleSet,
  cidrContains, cidrOverlaps, compileEnforcementPlan, compileSteeringRules, detectDrift, detectPolicyConflicts, evaluateApplicationPolicy, evaluatePacket,
  findAmbiguousRules, formatAddress, parseAddress, parseCidr, qosRules, reconcileOnce, splitPlan,
  type BackendCapabilities, type DataPlaneBackend, type DataPlaneOp, type DataPlaneRule, type FabricResource, type FirewallRule,
} from '../src/index.js';

const caps: BackendCapabilities = { id: 'nft', actions: ['steer', 'mark', 'rate-limit', 'drop', 'accept'], maxRules: 50, supportsIpv6: true, supportsPortRanges: true };
const rule = (id: string, extra: Partial<DataPlaneRule> = {}): DataPlaneRule => ({ id, priority: 10, owner: 'irp', match: { destinationCidr: '10.1.0.0/16' }, action: { type: 'steer', pathId: 'wan1' }, ...extra });

class MemBackend implements DataPlaneBackend {
  rules = new Map<string, DataPlaneRule>(); log: DataPlaneOp[] = []; failOn = -1; calls = 0;
  constructor(readonly capabilities: BackendCapabilities = caps) {}
  async list() { return [...this.rules.values()]; }
  async apply(op: DataPlaneOp) {
    if (this.calls++ === this.failOn) throw new Error('boom');
    this.log.push(op);
    if (op.kind === 'remove') this.rules.delete(op.ruleId); else this.rules.set(op.rule.id, op.rule);
  }
}

describe('cidr', () => {
  it('parses, contains, overlaps and formats', () => {
    expect(cidrContains(parseCidr('10.0.0.0/8'), parseAddress('10.2.3.4'))).toBe(true);
    expect(cidrOverlaps(parseCidr('10.0.0.0/8'), parseCidr('10.1.0.0/16'))).toBe(true);
    expect(cidrOverlaps(parseCidr('10.0.0.0/8'), parseCidr('11.0.0.0/8'))).toBe(false);
    expect(formatAddress(6, parseAddress('2001:db8::1').value)).toBe('2001:db8::1');
    expect(() => parseCidr('10.0.0.0/33')).toThrow();
    expect(() => parseAddress('300.1.1.1')).toThrow();
  });
});

describe('Phase 128 enforcement', () => {
  it('compiles plan with exact inverse and applies transactionally', async () => {
    const b = new MemBackend(); b.rules.set('old', rule('old'));
    const plan = compileEnforcementPlan([rule('a'), rule('b')], await b.list(), caps, 'irp');
    expect(plan.ops.map((o) => o.kind)).toEqual(['install', 'install', 'remove']);
    const res = await applyDataPlanePlan(plan, b, 'tx-1');
    expect(res.status).toBe('applied');
    expect([...b.rules.keys()].sort()).toEqual(['a', 'b']);
    await applyDataPlanePlan({ ...plan, ops: plan.inverse, inverse: plan.ops }, b, 'tx-2');
    expect([...b.rules.keys()]).toEqual(['old']);
  });
  it('rolls back on failure and refuses ungoverned apply', async () => {
    const b = new MemBackend(); b.failOn = 2;
    const plan = compileEnforcementPlan([rule('a'), rule('b'), rule('c')], [], caps, 'irp');
    const res = await applyDataPlanePlan(plan, b, 'tx');
    expect(res.status).toBe('rolled-back');
    expect(b.rules.size).toBe(0);
    expect((await applyDataPlanePlan(plan, new MemBackend(), '')).status).toBe('rejected');
  });
  it('rejects unsupported actions and budget overflow; detects ambiguity', () => {
    const small = { ...caps, actions: ['steer'] as const, maxRules: 1 } as BackendCapabilities;
    const p = compileEnforcementPlan([rule('x', { action: { type: 'drop' } })], [], small, 'irp');
    expect(p.rejected.length).toBe(1);
    expect(compileEnforcementPlan([rule('a'), rule('b')], [], small, 'irp').ops).toHaveLength(0);
    expect(findAmbiguousRules([rule('a'), rule('b', { action: { type: 'drop' } })])).toEqual([['a', 'b']]);
  });
});

describe('Phase 129 flows', () => {
  const key = { protocol: 'tcp', src: '10.0.0.2', srcPort: 4000, dst: '1.1.1.1', dstPort: 443 } as const;
  it('tracks lifecycle, pins established flows and sweeps idle ones', () => {
    const t = new FlowTable();
    t.observe({ key, atMs: 0, signal: 'syn', pathId: 'wan1' });
    expect(t.canMigrate(key).allowed).toBe(true);
    t.observe({ key, atMs: 10, signal: 'ack', bytes: 100 });
    expect(t.get(key)?.state).toBe('established');
    expect(t.canMigrate(key).allowed).toBe(false);
    expect(t.pinnedTo('wan1')).toHaveLength(1);
    expect(t.sweep(40_000)).toHaveLength(1);
    expect(t.get(key)?.state).toBe('stalled');
    t.sweep(400_000);
    expect(t.get(key)?.state).toBe('closed');
    t.observe({ key, atMs: 400_001, signal: 'rst' });
    expect(t.stats(400_002).closed).toBeGreaterThan(0);
  });
  it('evicts at capacity', () => {
    const t = new FlowTable({ ...{ capacity: 2, idleTimeoutMs: { tcp: 1, udp: 1, icmp: 1, quic: 1, other: 1 }, stalledAfterMs: 1, longLivedMs: 1, closedRetentionMs: 1 } });
    for (let i = 0; i < 4; i += 1) t.observe({ key: { ...key, srcPort: i }, atMs: i });
    expect(t.stats(10).evicted).toBe(2);
  });
});

describe('Phase 130 QoS', () => {
  it('honours guarantees, ceilings and weighted fairness', () => {
    const plan = allocateBandwidth(10_000, [
      { trafficClass: 'realtime', demandKbps: 50_000 }, { trafficClass: 'bulk', demandKbps: 50_000 }, { trafficClass: 'streaming', demandKbps: 50_000 },
    ]);
    const get = (c: string) => plan.allocations.find((a) => a.trafficClass === c)!;
    expect(get('realtime').allocatedKbps).toBeLessThanOrEqual(20_000);
    expect(get('streaming').allocatedKbps).toBeGreaterThan(get('bulk').allocatedKbps);
    expect(plan.allocations.reduce((s, a) => s + a.allocatedKbps, 0)).toBeLessThanOrEqual(10_000 + 1e-6);
    expect(plan.oversubscribed).toBe(true);
    expect(qosRules(plan, 'irp', 'wan1').length).toBeGreaterThan(0);
  });
  it('protects guarantees under severe scarcity', () => {
    const plan = allocateBandwidth(400, [{ trafficClass: 'control', demandKbps: 100 }, { trafficClass: 'realtime', demandKbps: 1000 }, { trafficClass: 'bulk', demandKbps: 1000 }]);
    expect(plan.allocations.find((a) => a.trafficClass === 'control')?.allocatedKbps).toBe(64);
    expect(plan.unmetGuarantees).toContain('realtime');
    expect(() => allocateBandwidth(0, [])).toThrow();
  });
});

describe('Phase 131 application policy', () => {
  const res = (id: string, extra: Partial<FabricResource> = {}): FabricResource => ({
    id, kind: 'LINK', state: 'ACTIVE', health: 'HEALTHY', confidence: 1, observedAt: '2026-01-01T00:00:00Z', trust: 0.9, capacity: {}, cost: { usd: 1 },
    owner: 'o', failureDomains: ['isp-a'], lifecycle: 'ACTIVE', capabilities: [], metadata: {}, ...extra,
  } as unknown as FabricResource);
  it('filters candidates, finds conflicts and compiles steering', () => {
    const policy = { application: 'voip', destinationCidrs: ['10.9.0.0/24'], minimumTrust: 0.8, excludedFailureDomains: ['isp-b'], priority: 5 };
    const ev = evaluateApplicationPolicy(policy, [res('a'), res('b', { failureDomains: ['isp-b'] }), res('c', { trust: 0.1 })]);
    expect(ev.permitted.map((r) => r.id)).toEqual(['a']);
    expect(ev.violations).toHaveLength(2);
    expect(detectPolicyConflicts([policy, { ...policy, application: 'video' }]).some((c) => c.reason.startsWith('equal-priority'))).toBe(true);
    expect(compileSteeringRules([policy], { voip: 'a' }, 'irp')).toHaveLength(1);
    expect(compileSteeringRules([policy], {}, 'irp')).toHaveLength(0);
  });
});

describe('Phase 132 addresses', () => {
  it('allocates deterministically, expires, renews and rejects overlap', () => {
    const m = new AddressManager();
    m.addPool('lan', '192.168.1.0/29');
    expect(() => m.addPool('x', '192.168.1.0/30')).toThrow(AddressPoolError);
    const a = m.allocate('lan', 'dev1', 1000, 0);
    expect(a.address).toBe('192.168.1.1');
    expect(m.allocate('lan', 'dev2', 1000, 0).address).toBe('192.168.1.2');
    expect(m.renew('lan', a.address, 'dev1', 5000, 500).expiresAtMs).toBe(5500);
    expect(() => m.renew('lan', a.address, 'dev2', 1, 0)).toThrow(AddressPoolError);
    expect(m.holderOf('192.168.1.2', 2000)).toBeUndefined();
    for (let i = 0; i < 5; i += 1) m.allocate('lan', `h${i}`, 1000, 3000);
    expect(() => m.allocate('lan', 'late', 1000, 3000)).toThrow(/exhausted/);
    expect(m.release("lan", "192.168.1.2", "h0")).toBe(true);
  });
});

describe('Phase 133 firewall', () => {
  const open: FirewallRule[] = [
    { id: 'ctl', priority: 1, direction: 'in', protocol: 'tcp', dstPorts: [8443, 8443], verdict: 'accept' },
    { id: 'ssh', priority: 2, direction: 'in', protocol: 'tcp', dstPorts: [22, 22], verdict: 'accept' },
    { id: 'dns-u', priority: 3, direction: 'out', protocol: 'udp', dstPorts: [53, 53], verdict: 'accept' },
    { id: 'dns-t', priority: 4, direction: 'out', protocol: 'tcp', dstPorts: [53, 53], verdict: 'accept' },
    { id: 'agent', priority: 5, direction: 'out', protocol: 'tcp', dstPorts: [443, 443], verdict: 'accept' },
  ];
  it('evaluates first-match and fails closed', () => {
    expect(evaluatePacket(open, { protocol: 'tcp', src: '1.1.1.1', dst: '10.0.0.1', dstPort: 22, direction: 'in' }).ruleId).toBe('ssh');
    expect(evaluatePacket(open, { protocol: 'tcp', src: '1.1.1.1', dst: '10.0.0.1', dstPort: 80, direction: 'in' }).verdict).toBe('drop');
  });
  it('refuses lockouts and flags shadowed contradictions', () => {
    expect(assertSafeRuleSet(open).lockouts).toHaveLength(0);
    const locking: FirewallRule[] = [{ id: 'deny-all', priority: 0, verdict: 'drop' }, ...open];
    expect(() => assertSafeRuleSet(locking)).toThrow(FirewallLockoutError);
    const a = analyzeRules([...open, { id: 'late', priority: 99, direction: 'in', protocol: 'tcp', dstPorts: [22, 22], verdict: 'drop' }]);
    expect(a.shadowed).toContainEqual({ rule: 'late', by: 'ssh' });
    expect(analyzeRules([{ id: 'bad', priority: 1, srcCidr: 'nope', verdict: 'accept' }]).invalid).toHaveLength(1);
  });
});

describe('Phase 134 reconciliation', () => {
  it('detects drift, converges, and reverts when verification fails', async () => {
    const b = new MemBackend();
    const desired = [rule('a'), rule('b'), rule('c')];
    expect(detectDrift(desired, [], 'irp').missing).toHaveLength(3);
    const ok = await reconcileOnce(desired, b, { verify: async () => true }, 'irp', 'tx', { maxOpsPerPass: 2 });
    expect(ok.status).toBe('partial'); expect(ok.remainingOps).toBe(1);
    expect((await reconcileOnce(desired, b, { verify: async () => true }, 'irp', 'tx')).status).toBe('confirmed');
    expect((await reconcileOnce(desired, b, { verify: async () => true }, 'irp', 'tx')).status).toBe('in-sync');
    expect(detectDrift(desired, await b.list(), 'irp').inSync).toBe(true);
    const b2 = new MemBackend();
    const bad = await reconcileOnce(desired, b2, { verify: async () => false }, 'irp', 'tx');
    expect(bad.status).toBe('reverted');
    expect(b2.rules.size).toBe(0);
    const hang = await reconcileOnce(desired, new MemBackend(), { verify: () => new Promise(() => {}) }, 'irp', 'tx', { confirmDeadlineMs: 20 });
    expect(hang.status).toBe('reverted');
    expect(splitPlan(compileEnforcementPlan(desired, [], caps, 'irp'), 1).ops).toHaveLength(1);
  });
});
