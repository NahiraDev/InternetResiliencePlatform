import { describe, expect, it } from 'vitest';
import {
  CongestionTracker, DEFAULT_CLASSIFICATION_RULES, PredictiveFailoverAdvisor, ProgrammableConnectivityFabric,
  RouteOptimizationAdvisor, RoutingPolicyValidationError, ServiceReachabilityLedger, applyCongestionToResource,
  classifyFlow, classifyFlows, resolveRoutingPolicy, routingHintsFromClassification, selectWithRoutingPolicy,
  summarizeTrafficMix, toRouteChangeCandidate, validateClassificationRules, validateRoutingPolicies,
  type FabricResource, type RoutingPolicyRule,
} from '../src/index.js';

const now = '2026-10-27T12:00:00.000Z';
const at = (offsetMs: number) => new Date(Date.parse(now) + offsetMs).toISOString();

const route = (id: string, o: Partial<FabricResource> = {}): FabricResource => ({
  id, kind: 'Route', state: 'HEALTHY', health: { status: 'healthy', score: 80, checkedAt: now }, confidence: 0.9, observedAt: now,
  trust: 0.8, capacity: {}, cost: { latencyMs: 20 }, owner: 'test', failureDomains: [`d-${id}`], lifecycle: 'active', capabilities: [], metadata: {}, ...o,
});

const fabricWith = async (...resources: FabricResource[]) => {
  const fabric = new ProgrammableConnectivityFabric();
  fabric.registerProvider({ id: 'p', owner: 'test', async discover() { return resources; } });
  await fabric.discover();
  return fabric;
};

describe('Phase 94 — traffic classification', () => {
  it('classifies by rule priority deterministically and exposes routing hints', () => {
    const c = classifyFlow({ flowId: 'a', protocol: 'tcp', destinationPort: 22 });
    expect(c).toMatchObject({ trafficClass: 'interactive', application: 'ssh', basis: 'rule', ruleId: 'ssh' });
    expect(routingHintsFromClassification(c)).toEqual({ 'routing.application': 'ssh', 'routing.trafficClass': 'interactive' });
  });
  it('splits https by throughput and falls back to heuristics, hints and default', () => {
    expect(classifyFlow({ flowId: 'x', protocol: 'tcp', destinationPort: 443, bytesPerSecond: 1_000_000 }).trafficClass).toBe('streaming');
    expect(classifyFlow({ flowId: 'x', protocol: 'tcp', destinationPort: 443, bytesPerSecond: 9_000_000 }).trafficClass).toBe('bulk');
    expect(classifyFlow({ flowId: 'x', protocol: 'udp', destinationPort: 4000, packetsPerSecond: 50, meanPacketBytes: 160 })).toMatchObject({ trafficClass: 'realtime', basis: 'heuristic' });
    expect(classifyFlow({ flowId: 'x', protocol: 'other', applicationHint: 'custom' })).toMatchObject({ basis: 'hint', application: 'custom' });
    expect(classifyFlow({ flowId: 'x', protocol: 'other' })).toMatchObject({ trafficClass: 'unknown', basis: 'default', confidence: 0 });
  });
  it('matches host wildcards and summarizes mix', () => {
    const flows = classifyFlows([
      { flowId: 'b', protocol: 'tcp', destinationPort: 443, destinationHost: 'dl.windowsupdate.com' },
      { flowId: 'a', protocol: 'other' },
    ]);
    expect(flows.map((f) => f.flowId)).toEqual(['a', 'b']);
    const mix = summarizeTrafficMix(flows);
    expect(mix.unclassifiedRatio).toBe(0.5);
    expect(mix.byClass.interactive + mix.byClass.background).toBeGreaterThanOrEqual(1);
  });
  it('rejects invalid rule sets', () => {
    expect(() => validateClassificationRules([...DEFAULT_CLASSIFICATION_RULES, DEFAULT_CLASSIFICATION_RULES[0]!])).toThrow(/duplicate/);
    expect(() => validateClassificationRules([{ id: 'r', priority: 1, trafficClass: 'bulk', confidence: 2 }])).toThrow(/confidence/);
  });
});

describe('Phase 95 — policy-based routing', () => {
  const rules: RoutingPolicyRule[] = [
    { id: 'block-bulk-peak', priority: 1, match: { trafficClasses: ['bulk'], utcHours: [11, 14] }, action: 'deny' },
    { id: 'ssh-trusted', priority: 2, match: { applications: ['ssh'] }, action: 'route', constraints: { minimumTrust: 0.9, kind: 'Route' } },
  ];
  it('narrows fabric selection through policy constraints', async () => {
    const fabric = await fabricWith(route('low', { trust: 0.5 }), route('high', { trust: 0.95 }));
    const out = selectWithRoutingPolicy(fabric, rules, { classification: classifyFlow({ flowId: 's', protocol: 'tcp', destinationPort: 22 }), now });
    expect(out.allowed).toBe(true);
    expect(out.selection?.selected?.id).toBe('high');
    expect(out.selection?.audit.applicationAffinity).toBe('ssh');
  });
  it('denies without touching the fabric and fails closed on invalid sets', async () => {
    const fabric = await fabricWith(route('r'));
    const bulk = classifyFlow({ flowId: 'b', protocol: 'tcp', destinationPort: 443, bytesPerSecond: 9_000_000 });
    const denied = selectWithRoutingPolicy(fabric, rules, { classification: bulk, now });
    expect(denied).toMatchObject({ allowed: false, decision: { outcome: 'deny', ruleId: 'block-bulk-peak' } });
    expect(denied.selection).toBeUndefined();
    const bad = resolveRoutingPolicy([...rules, { ...rules[1]!, id: 'dup', priority: 2 }], { classification: bulk, now });
    expect(bad.outcome).toBe('deny');
    expect(() => validateRoutingPolicies([{ id: 'x', priority: 1, match: {}, action: 'route' }])).toThrow(RoutingPolicyValidationError);
  });
  it('reports no-policy when nothing matches', () => {
    const d = resolveRoutingPolicy(rules, { classification: classifyFlow({ flowId: 'z', protocol: 'other' }), now });
    expect(d.outcome).toBe('no-policy');
  });
});

describe('Phase 96 — dynamic route optimization', () => {
  it('keeps the current route inside the hysteresis margin and switches beyond it', async () => {
    const fabric = await fabricWith(route('cur', { health: { status: 'healthy', score: 70, checkedAt: now } }), route('better', { health: { status: 'healthy', score: 98, checkedAt: now } }));
    const advisor = new RouteOptimizationAdvisor(fabric);
    const rec = advisor.evaluate({ resourceId: 'cur', activeSince: at(-10 * 60_000) }, { kind: 'Route' }, now);
    expect(rec.verdict).toBe('switch');
    const candidate = toRouteChangeCandidate(rec, 'corr-1');
    expect(candidate).toMatchObject({ intent: 'route_change', correlationId: 'corr-1' });
    const held = advisor.evaluate({ resourceId: 'cur', activeSince: at(-1_000) }, { kind: 'Route' }, now);
    expect(held.verdict).toBe('hold');
    expect(held.reasons).toContain('minimum-dwell-not-elapsed');
    expect(toRouteChangeCandidate(held)).toBeUndefined();
  });
  it('forces a switch when the active route is ineligible and enforces the flap budget', async () => {
    const fabric = await fabricWith(route('dead', { state: 'FAILED' }), route('ok'));
    const advisor = new RouteOptimizationAdvisor(fabric, { improvementMargin: 0.1, minDwellMs: 0, maxSwitchesPerWindow: 1, windowMs: 60_000 });
    expect(advisor.evaluate({ resourceId: 'dead', activeSince: at(-5000) }, {}, now).verdict).toBe('switch');
    advisor.recordApplied(at(-1000));
    expect(advisor.evaluate({ resourceId: 'dead', activeSince: at(-5000) }, {}, now).verdict).toBe('hold');
  });
  it('reports unavailable when nothing is selectable', async () => {
    const fabric = await fabricWith(route('f', { state: 'FAILED' }));
    expect(new RouteOptimizationAdvisor(fabric).evaluate({ resourceId: 'f', activeSince: at(-9e6) }, {}, now).verdict).toBe('unavailable');
  });
});

describe('Phase 97 — service reachability intelligence', () => {
  it('derives states and attributes the dominant failure layer', () => {
    const ledger = new ServiceReachabilityLedger();
    for (let i = 0; i < 10; i += 1) ledger.record({ serviceId: 's', pathId: 'a', at: at(-i * 1000), ok: true, latencyMs: 20 + i });
    for (let i = 0; i < 6; i += 1) ledger.record({ serviceId: 's', pathId: 'b', at: at(-i * 1000), ok: false, failedLayer: 'tls' });
    expect(ledger.verdict('s', 'a', now)).toMatchObject({ state: 'reachable', successRatio: 1 });
    expect(ledger.verdict('s', 'b', now)).toMatchObject({ state: 'unreachable', dominantFailureLayer: 'tls', consecutiveFailures: 6 });
    expect(ledger.servicePaths('s', now).map((p) => p.pathId)).toEqual(['a', 'b']);
    expect(ledger.serviceState('s', now)).toBe('reachable');
    expect(ledger.verdict('missing', 'p', now).state).toBe('unknown');
  });
  it('goes stale and validates probe shape', () => {
    const ledger = new ServiceReachabilityLedger();
    for (let i = 0; i < 5; i += 1) ledger.record({ serviceId: 's', pathId: 'a', at: at(-3_600_000 - i), ok: true });
    expect(ledger.verdict('s', 'a', now)).toMatchObject({ state: 'unknown', stale: true });
    expect(() => ledger.record({ serviceId: 's', pathId: 'a', at: now, ok: false })).toThrow(/failedLayer/);
  });
  it('reports a service outage only when every path is unreachable', () => {
    const ledger = new ServiceReachabilityLedger();
    for (let i = 0; i < 5; i += 1) ledger.record({ serviceId: 's', pathId: 'a', at: at(-i), ok: false, failedLayer: 'dns' });
    expect(ledger.serviceState('s', now)).toBe('unreachable');
  });
});

describe('Phase 98 — congestion & degradation awareness', () => {
  it('requires confirmation before escalating and hysteresis before clearing', () => {
    const t = new CongestionTracker();
    const s = (u: number, i: number) => t.observe({ resourceId: 'r', at: at(i * 1000), utilization: u, idleLatencyMs: 10, loadedLatencyMs: 10 });
    expect(s(0.95, 0).level).toBe('clear');
    for (let i = 1; i < 6; i += 1) s(0.95, i);
    expect(['congested', 'saturated']).toContain(t.level('r'));
    for (let i = 6; i < 40; i += 1) s(0.0, i);
    expect(t.level('r')).toBe('clear');
  });
  it('flags bufferbloat and derates resources without mutating them', () => {
    const t = new CongestionTracker({ ...{ alpha: 1, enter: [0.35, 0.6, 0.85] as const, exitMargin: 0.08, confirmations: 1, bufferbloatInflation: 3 } });
    const a = t.observe({ resourceId: 'r', at: now, utilization: 0.9, idleLatencyMs: 10, loadedLatencyMs: 80, lossRatio: 0.03 });
    expect(a.bufferbloat).toBe(true);
    expect(a.degraded).toBe(true);
    const original = route('r');
    const derated = applyCongestionToResource(original, a);
    expect(derated.health.score).toBeLessThan(original.health.score);
    expect(original.health.score).toBe(80);
    expect(applyCongestionToResource(original, { ...a, level: 'clear' })).toBe(original);
  });
});

describe('Phase 99 — predictive failover & recovery', () => {
  it('predicts breach on a degrading trend and pre-arms a standby through the fabric', async () => {
    const fabric = await fabricWith(route('primary'), route('standby'));
    const advisor = new PredictiveFailoverAdvisor(fabric);
    for (let i = 0; i < 8; i += 1) advisor.observe({ resourceId: 'primary', at: at(-(8 - i) * 30_000), score: 90 - i * 6 });
    const adv = advisor.advise('primary', { kind: 'Route' }, now);
    expect(['prepare', 'imminent']).toContain(adv.urgency);
    expect(adv.standby?.id).toBe('standby');
    expect(adv.predictedBreachInMs).toBeGreaterThan(0);
  });
  it('ignores flat or improving series and insufficient data', async () => {
    const advisor = new PredictiveFailoverAdvisor(await fabricWith(route('a')));
    expect(advisor.advise('a', {}, now).reasons).toContain('insufficient-samples');
    for (let i = 0; i < 8; i += 1) advisor.observe({ resourceId: 'a', at: at(-(8 - i) * 1000), score: 50 + i * 3 });
    expect(advisor.advise('a', {}, now).urgency).toBe('none');
  });
  it('gates recovery on consecutive healthy samples and dwell', async () => {
    const advisor = new PredictiveFailoverAdvisor(await fabricWith(route('a')));
    for (let i = 0; i < 6; i += 1) advisor.observe({ resourceId: 'a', at: at(-(6 - i) * 10_000), score: 95 });
    expect(advisor.recoveryReadiness('a', now).reasons).toContain('recovery-dwell-not-elapsed');
    expect(advisor.recoveryReadiness('a', at(5 * 60_000)).ready).toBe(true);
    advisor.observe({ resourceId: 'a', at: at(1000), score: 10 });
    expect(advisor.recoveryReadiness('a', at(5 * 60_000)).ready).toBe(false);
  });
});
