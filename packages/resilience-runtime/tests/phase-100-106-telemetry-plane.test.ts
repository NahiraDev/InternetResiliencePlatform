import { describe, expect, it } from 'vitest';
import {
  AnomalyDetector, AssuranceObservationProvider, DependencyCycleError, DependencyGraph, TelemetryBackpressureError,
  TelemetryChannel, TelemetryRecordStore, TelemetryValidationError, TimeSeriesStore, correlateTelemetry,
  evaluateObjective, evaluateObjectives, normalizeTelemetry, telemetryFromObservation, validateObjectives,
  observation, type AssuranceObjective, type FabricResource, type RuntimeContext,
} from '../src/index.js';

const T0 = Date.parse('2026-10-27T12:00:00.000Z');
const iso = (offset: number) => new Date(T0 + offset).toISOString();

describe('Phase 100 — unified telemetry', () => {
  it('normalizes, classifies and redacts labels deterministically', () => {
    const a = normalizeTelemetry({ kind: 'metric', name: 'runtime_cycles_total', at: iso(0), value: 3, source: 'rt', labels: { password: 'hunter2', zone: 'a' }, scope: { deviceId: 'd1' } });
    const b = normalizeTelemetry({ kind: 'metric', name: 'runtime_cycles_total', at: iso(0), value: 3, source: 'rt', labels: { zone: 'a', password: 'hunter2' }, scope: { deviceId: 'd1' } });
    expect(a.id).toBe(b.id);
    expect(a.telemetryClass).toBe('operational');
    expect(a.labels.password).not.toContain('hunter2');
    expect(normalizeTelemetry({ kind: 'event', name: 'custom.metric', at: iso(0), source: 's' }).telemetryClass).toBe('diagnostic');
  });
  it('rejects malformed input and maps observations', () => {
    expect(() => normalizeTelemetry({ kind: 'metric', name: 'Bad Name', at: iso(0), source: 's' })).toThrow(TelemetryValidationError);
    expect(() => normalizeTelemetry({ kind: 'metric', name: 'ok', at: 'nope', source: 's' })).toThrow(/timestamp/);
    expect(() => normalizeTelemetry({ kind: 'metric', name: 'ok', at: iso(0), value: Number.NaN, source: 's' })).toThrow(/finite/);
    const rec = telemetryFromObservation(observation('probe', 'dns', 'latency', 'healthy', 12), { resourceId: 'r1' });
    expect(rec).toMatchObject({ kind: 'observation', value: 12, scope: { resourceId: 'r1' } });
  });
  it('bounds the store, evicts oldest and queries by scope', () => {
    const store = new TelemetryRecordStore(3);
    for (let i = 0; i < 5; i += 1) store.append({ kind: 'metric', name: 'm', at: iso(i * 1000), value: i, source: 's', scope: { deviceId: i % 2 ? 'odd' : 'even' } });
    expect(store.size).toBe(3);
    expect(store.evictedCount).toBe(2);
    expect(store.query({ scope: { deviceId: 'odd' } }).map((r) => r.value)).toEqual([3]);
    expect(store.query({ limit: 1 })[0]?.value).toBe(4);
    expect(() => new TelemetryRecordStore(0)).toThrow();
  });
});

describe('Phase 101 — streaming', () => {
  const rec = (i: number) => normalizeTelemetry({ kind: 'metric', name: 'm', at: iso(i), value: i, source: 's' });
  it('applies backpressure policies without blocking producers', () => {
    const ch = new TelemetryChannel();
    ch.subscribe({ id: 'old', capacity: 2, policy: 'drop-oldest' });
    ch.subscribe({ id: 'new', capacity: 2, policy: 'drop-newest' });
    ch.subscribe({ id: 'rej', capacity: 2, policy: 'reject' });
    const rejected: string[][] = [];
    for (let i = 0; i < 4; i += 1) rejected.push([...ch.publish(rec(i))]);
    expect(rejected[3]).toEqual(['rej']);
    expect(ch.poll('old').map((r) => r.value)).toEqual([2, 3]);
    expect(ch.poll('new').map((r) => r.value)).toEqual([0, 1]);
    const stats = Object.fromEntries(ch.stats().map((s) => [s.id, s]));
    expect(stats.old).toMatchObject({ dropped: 2, delivered: 2 });
    expect(stats.rej?.rejected).toBe(2);
    expect(new TelemetryBackpressureError('x').message).toContain('reject');
  });
  it('filters, isolates failing consumers and rejects duplicate subscriptions', async () => {
    const ch = new TelemetryChannel();
    ch.subscribe({ id: 'even', filter: (r) => (r.value ?? 0) % 2 === 0 });
    ch.subscribe({ id: 'boom', filter: () => { throw new Error('bad filter'); } });
    expect(() => ch.subscribe({ id: 'even' })).toThrow(/already exists/);
    for (let i = 0; i < 4; i += 1) ch.publish(rec(i));
    expect(await ch.flush('even', () => { throw new Error('consumer down'); })).toBe(0);
    expect(ch.stats().find((s) => s.id === 'even')?.dropped).toBe(2);
    expect(() => ch.poll('missing')).toThrow(/unknown/);
  });
});

describe('Phase 102 — cross-layer correlation', () => {
  const r = (layer: string, offset: number, status: string, extra: Record<string, unknown> = {}) =>
    normalizeTelemetry({ kind: 'event', name: `evt.${layer}`, at: iso(offset), source: 's', scope: { layer, deviceId: 'dev', resourceId: `res-${layer}` }, labels: { status }, ...extra });
  it('reports the lowest failing layer as root cause and lists downstream layers', () => {
    const groups = correlateTelemetry([r('application', 5000, 'failed'), r('link', 0, 'failed'), r('dns', 2000, 'degraded'), r('transport', 9000, 'healthy')]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ rootCauseLayer: 'link', rootCauseResource: 'res-link', downstreamLayers: ['dns', 'application'] });
    expect(groups[0]?.confidence).toBeGreaterThan(0.7);
  });
  it('joins by correlation id and separates distant incidents', () => {
    const a = correlateTelemetry([r('network', 0, 'failed', { correlationId: 'c1' }), r('application', 600_000, 'failed', { correlationId: 'c1' })]);
    expect(a).toHaveLength(1);
    const far = correlateTelemetry([r('network', 0, 'failed'), r('application', 600_000, 'failed')]);
    expect(far).toHaveLength(2);
  });
});

const res = (id: string, kind: FabricResource['kind'], domains: string[] = []): FabricResource => ({
  id, kind, state: 'HEALTHY', health: { status: 'healthy', score: 90, checkedAt: iso(0) }, confidence: 1, observedAt: iso(0), trust: 1,
  capacity: {}, cost: {}, owner: 'o', failureDomains: domains, lifecycle: 'active', capabilities: [], metadata: {},
});

describe('Phase 103 — topology & dependency intelligence', () => {
  const snapshot = {
    resources: [res('svc', 'Service'), res('routeA', 'Route', ['isp1']), res('routeB', 'Route', ['isp1']), res('gw', 'Gateway'), res('app', 'Destination')],
    edges: [
      { from: 'app', to: 'svc', relation: 'uses' }, { from: 'svc', to: 'routeA', relation: 'via' }, { from: 'svc', to: 'routeB', relation: 'via' },
      { from: 'routeA', to: 'gw', relation: 'via' }, { from: 'routeB', to: 'gw', relation: 'via' },
    ],
  };
  it('computes blast radius, SPOFs and shared failure domains', () => {
    const g = new DependencyGraph(snapshot);
    expect(g.impactOf('gw')).toMatchObject({ directDependents: ['routeA', 'routeB'], affectedDestinations: ['app', 'svc'] });
    expect(g.singlePointsOfFailure().map((s) => s.resourceId)).toEqual(['gw', 'svc']);
    expect(g.singlePointsOfFailure().some((s) => s.resourceId === 'routeA')).toBe(false);
    expect(g.sharedFailureDomains()).toEqual({ isp1: ['routeA', 'routeB'] });
    const order = g.topologicalOrder();
    expect(order.indexOf('gw')).toBeLessThan(order.indexOf('routeA'));
    expect(order.indexOf('routeA')).toBeLessThan(order.indexOf('app'));
  });
  it('detects cycles and ignores unknown edges', () => {
    const cyc = new DependencyGraph({ resources: [res('a', 'Route'), res('b', 'Route')], edges: [{ from: 'a', to: 'b', relation: 'x' }, { from: 'b', to: 'a', relation: 'x' }, { from: 'a', to: 'ghost', relation: 'x' }] });
    expect(() => cyc.topologicalOrder()).toThrow(DependencyCycleError);
    expect(cyc.dependenciesOf('a')).toEqual(['b']);
  });
});

describe('Phase 104 — time-series intelligence', () => {
  it('rolls up into deterministic buckets and compares windows', () => {
    const ts = new TimeSeriesStore();
    for (let i = 0; i < 120; i += 1) ts.record('lat', T0 + i * 1000, i < 60 ? 10 : 30);
    const buckets = ts.query('lat', { fromMs: T0, toMs: T0 + 119_000, resolutionMs: 60_000 });
    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({ count: 60, min: 10, max: 10, mean: 10 });
    expect(buckets[1]?.mean).toBe(30);
    const cmp = ts.compareWindows('lat', { fromMs: T0 + 60_000, toMs: T0 + 119_000 }, { fromMs: T0, toMs: T0 + 59_000 });
    expect(cmp.relativeChange).toBeCloseTo(2, 5);
  });
  it('selects tier resolution, expires old data and validates input', () => {
    const ts = new TimeSeriesStore();
    expect(ts.resolutionFor(T0 - 30 * 60_000, T0)).toBe(0);
    expect(ts.resolutionFor(T0 - 3 * 60 * 60_000, T0)).toBe(60_000);
    ts.record('s', T0 - 40 * 24 * 3_600_000, 1);
    ts.record('s', T0, 2);
    expect(ts.expire(T0)).toBe(1);
    expect(ts.seriesIds()).toEqual(['s']);
    expect(() => ts.record('s', T0, Number.NaN)).toThrow();
    expect(() => new TimeSeriesStore([{ resolutionMs: 0, retentionMs: 100 }, { resolutionMs: 10, retentionMs: 50 }])).toThrow(/retain less/);
  });
});

describe('Phase 105 — anomaly detection', () => {
  it('flags spikes after warm-up, excludes them from the baseline and applies cooldown', () => {
    const d = new AnomalyDetector();
    for (let i = 0; i < 30; i += 1) expect(d.observe('lat', T0 + i * 1000, 20 + (i % 3))).toHaveLength(0);
    const spike = d.observe('lat', T0 + 31_000, 400);
    expect(spike.map((f) => f.method)).toContain('robust-zscore');
    expect(spike.find((f) => f.method === 'robust-zscore')).toMatchObject({ direction: 'up', severity: 'high' });
    expect(d.observe('lat', T0 + 32_000, 410).filter((f) => f.method === 'robust-zscore')).toHaveLength(0);
    expect(d.observe('lat', T0 + 200_000, 20)).toHaveLength(0);
  });
  it('detects sustained shifts through CUSUM and ignores non-finite input', () => {
    const d = new AnomalyDetector({ warmup: 12, baselineSize: 60, zThreshold: 50, ewmaAlpha: 0.3, ewmaSigmas: 50, cusumSlack: 0.5, cusumThreshold: 4, cooldownMs: 0 });
    for (let i = 0; i < 20; i += 1) d.observe('s', T0 + i, 10 + (i % 2));
    let found = false;
    for (let i = 20; i < 40; i += 1) if (d.observe('s', T0 + i, 14).some((f) => f.method === 'cusum')) found = true;
    expect(found).toBe(true);
    expect(d.observe('s', Number.NaN, 1)).toHaveLength(0);
  });
});

describe('Phase 106 — telemetry-driven closed-loop assurance', () => {
  const objective: AssuranceObjective = { id: 'latency', seriesId: 'lat', comparator: 'lte', threshold: 50, target: 0.9, windowMs: 100_000, minPoints: 5 };
  const fill = (ts: TimeSeriesStore, bad: number) => { for (let i = 0; i < 20; i += 1) ts.record('lat', T0 - (20 - i) * 1000, i < bad ? 200 : 20); };
  it('evaluates met, at-risk, violated and insufficient-data states', () => {
    const ok = new TimeSeriesStore(); fill(ok, 0);
    expect(evaluateObjective(ok, objective, T0)).toMatchObject({ state: 'met', compliance: 1 });
    const risky = new TimeSeriesStore(); fill(risky, 2);
    expect(evaluateObjective(risky, objective, T0).state).toBe('at-risk');
    const bad = new TimeSeriesStore(); fill(bad, 8);
    expect(evaluateObjective(bad, objective, T0)).toMatchObject({ state: 'violated' });
    expect(evaluateObjective(new TimeSeriesStore(), objective, T0).state).toBe('insufficient-data');
    expect(() => validateObjectives([objective, objective])).toThrow(/duplicated/);
    expect(() => validateObjectives([{ ...objective, target: 0 }])).toThrow(/target/);
    expect(evaluateObjectives(ok, [objective], T0)).toHaveLength(1);
  });
  it('projects violations into the loop as standard observations', async () => {
    const bad = new TimeSeriesStore(); fill(bad, 8);
    const provider = new AssuranceObservationProvider(bad, [objective], () => T0);
    const result = await provider.collect({} as RuntimeContext);
    expect(result.errors).toEqual([]);
    expect(result.observations[0]).toMatchObject({ metric: 'assurance.latency', status: 'failed', severity: 'critical', category: 'assurance' });
  });
});
