import { describe, expect, it } from 'vitest';
import {
  BoundedParameterOptimizer, NetworkKnowledgeBase, applyAdvisory, buildAdvisoryContext, canonicalScore,
  consultAdvisoryModel, evaluateReleaseReadiness, expectedStepsToFailure, fitTransitionModel, parseAdvisoryReply,
  predictDistribution, predictStateSignal, runChaosExperiment, sanitizeChosenCandidate, simulateChanges, validateExperiment,
  type AdvisoryModelPort, type CandidateAction, type ChaosExperiment, type FabricResource, type FaultInjectionPort,
  type GateEvidence, type NetworkStateLabel,
} from '../src/index.js';

import { KnowledgeStore } from '../src/knowledge/knowledge-store.js';

const NOW = Date.parse('2026-10-27T12:00:00.000Z');
const iso = (o = 0) => new Date(NOW + o).toISOString();

describe('Phase 121 — network knowledge base', () => {
  const build = () => {
    const store = new KnowledgeStore({ nowMs: () => NOW });
    const base = { correlationId: 'c', observedAt: iso(-1000), expiresAt: iso(3_600_000), confidence: 0.8, halfLifeMs: 3_600_000 };
    store.record({ kind: 'measurement', source: 'measurement', provenance: { producer: 'p', source: 'measurement' }, scope: { destination: 'example.org', providerId: 'isp1' }, objectiveEvidence: { availability: 0.9 }, ...base });
    store.record({ kind: 'outcome', source: 'failure-memory', provenance: { producer: 'p', source: 'failure-memory' }, scope: { providerId: 'isp1' }, objectiveEvidence: { availability: 0.1 }, ...base });
    store.record({ kind: 'prediction', source: 'federated', provenance: { producer: 'p', source: 'federated' }, scope: { providerId: 'isp2' }, ...base });
    return new NetworkKnowledgeBase(store, () => NOW);
  };
  it('profiles an entity with provenance, failures and weighted objective evidence', () => {
    const kb = build();
    const p = kb.profile({ kind: 'provider', id: 'isp1' });
    expect(p).toMatchObject({ recordCount: 2, failureSignals: 1, bySource: { measurement: 1, 'failure-memory': 1 } });
    expect(p.objectiveEvidence.availability).toBeGreaterThan(0.1);
    expect(p.objectiveEvidence.availability).toBeLessThan(0.9);
    expect(kb.profile({ kind: 'provider', id: 'isp2' }).advisoryOnlyRatio).toBe(1);
  });
  it('ranks failing entities and explains unknown ones honestly', () => {
    const kb = build();
    expect(kb.rankByFailures('provider').map((x) => x.entity.id)).toEqual(['isp1']);
    expect(kb.explain({ kind: 'provider', id: 'isp1' })).toContain('1 failure signals');
    expect(kb.explain({ kind: 'destination', id: 'nowhere' })).toContain('No live knowledge');
    expect(kb.factsFor({ kind: 'destination', id: 'example.org' })).toHaveLength(1);
  });
});

describe('Phase 122 — network state prediction', () => {
  const seq = (pattern: string): NetworkStateLabel[] => [...pattern].map((c) => (c === 'h' ? 'healthy' : c === 'd' ? 'degraded' : 'failed'));
  it('fits a smoothed transition model whose rows are distributions', () => {
    const m = fitTransitionModel(seq('hhhhdhhhhdhhhhfhhh'));
    for (const row of Object.values(m.matrix)) expect(Object.values(row).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(m.matrix.healthy.healthy).toBeGreaterThan(m.matrix.healthy.failed);
    expect(() => fitTransitionModel([], -1)).toThrow();
  });
  it('predicts distributions and expected steps to failure', () => {
    const m = fitTransitionModel(seq('hhdhhdhhdhhfhhdhhfhh'));
    const d = predictDistribution(m, 'degraded', 3);
    expect(d.healthy + d.degraded + d.failed).toBeCloseTo(1, 9);
    expect(predictDistribution(m, 'healthy', 0)).toEqual({ healthy: 1, degraded: 0, failed: 0 });
    expect(expectedStepsToFailure(m, 'failed')).toBe(0);
    expect(expectedStepsToFailure(m, 'healthy')).toBeGreaterThan(expectedStepsToFailure(m, 'degraded') > 0 ? 0 : 1);
    expect(() => predictDistribution(m, 'healthy', -1)).toThrow();
  });
  it('emits an advisory signal only with enough history', () => {
    expect(predictStateSignal('p', seq('hhd'), { stepMs: 1000, horizonSteps: 3 })).toBeUndefined();
    const sig = predictStateSignal('p', seq('hdfdfdfdfdfdfdfdf'), { stepMs: 60_000, horizonSteps: 5, nowMs: NOW });
    expect(sig).toBeDefined();
    expect(sig?.horizonMs).toBe(300_000);
    expect(sig?.confidence).toBeLessThanOrEqual(0.9);
    expect(['degrading', 'stable', 'improving']).toContain(sig?.direction);
    const healthy = predictStateSignal('p', seq('hhhhhhhhhhhhhhhhh'), { stepMs: 1000, horizonSteps: 3, nowMs: NOW });
    expect(healthy?.direction).toBe('stable');
  });
});

const cand = (id: string, o: Partial<CandidateAction> = {}): CandidateAction => ({
  id, schemaVersion: 1, createdAt: iso(), source: 'test', metadata: {}, intent: 'route_change', expectedBenefit: 0.5, risk: 0.2, confidence: 0.8,
  requiredCapabilities: ['fabric.mutate'], dependencies: [], postconditions: [], verificationRequirements: [], rejectionReasons: [], ...o,
});

describe('Phase 123 — decision intelligence & AI assistance', () => {
  it('builds an allow-listed, redacted context', () => {
    const ctx = buildAdvisoryContext({ incidentClass: 'primary_failure', apiKey: 'sk-secret', hostname: 'internal.corp', token: 'abc' }, [cand('a')]);
    expect(Object.keys(ctx).sort()).toEqual(['candidateSummaries', 'incidentClass']);
    expect(JSON.stringify(ctx)).not.toContain('sk-secret');
  });
  it('validates replies against a closed schema', () => {
    expect(parseAdvisoryReply({ ranking: [{ candidateId: 'a', weight: 0.5 }], rationale: 'ok' })).toBeDefined();
    expect(parseAdvisoryReply({ ranking: [], rationale: 'x', intent: 'dns_switch' })).toBeUndefined();
    expect(parseAdvisoryReply({ ranking: [{ candidateId: 'a', weight: 2 }], rationale: 'x' })).toBeUndefined();
    expect(parseAdvisoryReply({ ranking: [{ candidateId: 'a', weight: 0.5, requiredCapabilities: [] }], rationale: 'x' })).toBeUndefined();
    expect(parseAdvisoryReply('nope')).toBeUndefined();
  });
  it('lets AI reorder only within bounded influence and never add or promote rejected candidates', () => {
    const a = cand('a', { expectedBenefit: 0.6 }); const b = cand('b', { expectedBenefit: 0.58 }); const bad = cand('bad', { expectedBenefit: 1, rejectionReasons: ['unsafe'] });
    expect(canonicalScore(a)).toBeGreaterThan(canonicalScore(b));
    const out = applyAdvisory([a, b, bad], { ranking: [{ candidateId: 'b', weight: 1 }, { candidateId: 'bad', weight: 1 }, { candidateId: 'invented', weight: 1 }], rationale: 'prefer b' });
    expect(out.status === 'applied' && out.ordered.map((c) => c.id)).toEqual(['b', 'a', 'bad']);
    expect(out.status === 'applied' && out.ignored).toEqual(['invented']);
  });
  it('degrades to canonical order on timeout, errors and invalid replies', async () => {
    const cs = [cand('lo', { expectedBenefit: 0.1 }), cand('hi', { expectedBenefit: 0.9 })];
    const slow: AdvisoryModelPort = { advise: (_c, s) => new Promise((r) => { const t = setTimeout(() => r({}), 500); s.addEventListener('abort', () => clearTimeout(t)); }) };
    expect(await consultAdvisoryModel(slow, {}, cs, { timeoutMs: 10 })).toMatchObject({ status: 'no-advice', reason: 'timeout' });
    expect(await consultAdvisoryModel({ advise: async () => { throw new Error('x'); } }, {}, cs)).toMatchObject({ reason: 'model-error' });
    const bad = await consultAdvisoryModel({ advise: async () => ({ ranking: 'x', rationale: 1 }) }, {}, cs);
    expect(bad).toMatchObject({ status: 'no-advice', reason: 'invalid-reply' });
    expect(bad.ordered.map((c) => c.id)).toEqual(['hi', 'lo']);
    expect(await consultAdvisoryModel(undefined, {}, cs)).toMatchObject({ reason: 'empty' });
    const ok = await consultAdvisoryModel({ advise: async () => ({ ranking: [{ candidateId: 'lo', weight: 0 }], rationale: 'fine' }) }, {}, cs);
    expect(ok.status).toBe('applied');
  });
  it('returns canonical intent and capabilities only', () => {
    const s = sanitizeChosenCandidate(cand('a', { requiredCapabilities: ['fabric.mutate'] }), 'because');
    expect(s).toMatchObject({ intent: 'route_change', requiredCapabilities: ['fabric.mutate'], aiAdvisoryOnly: true, rationale: 'because' });
  });
});

describe('Phase 124 — autonomous optimization', () => {
  const params = () => new BoundedParameterOptimizer([{ name: 'margin', value: 0.1, min: 0.05, max: 0.5, maxStep: 0.05 }], { cooldownMs: 1000, trialDurationMs: 1000, maxChangesPerDay: 2 });
  it('is gated by autonomy and bounded by limits and step size', () => {
    const o = params();
    expect(o.propose('margin', 0.3, 1, 'ADVISORY', NOW)).toMatchObject({ started: false, reason: 'autonomy-advisory-forbids-changes' });
    expect(o.propose('nope', 0.3, 1, 'AUTONOMOUS', NOW).reason).toBe('unknown-parameter');
    const r = o.propose('margin', 0.9, 1, 'AUTONOMOUS', NOW);
    expect(r.started).toBe(true);
    expect(o.current('margin')).toBeCloseTo(0.15, 9);
    expect(o.propose('margin', 0.2, 1, 'AUTONOMOUS', NOW + 1).reason).toBe('trial-in-progress');
  });
  it('reverts early on regression and commits genuine improvements', () => {
    const o = params();
    o.propose('margin', 0.3, 100, 'SAFE_AUTOMATION', NOW);
    expect(o.evaluate(90, NOW + 10)).toMatchObject({ outcome: 'reverted' });
    expect(o.current('margin')).toBe(0.1);
    o.propose('margin', 0.3, 100, 'SAFE_AUTOMATION', NOW + 5000);
    expect(o.evaluate(101, NOW + 5500).outcome).toBe('running');
    expect(o.evaluate(105, NOW + 7000).outcome).toBe('committed');
    expect(o.current('margin')).toBeCloseTo(0.15, 9);
    expect(o.history().map((h) => h.decision)).toEqual(['applied', 'reverted', 'applied', 'committed']);
  });
  it('reverts flat trials, enforces cooldown and budget, and supports abort', () => {
    const o = params();
    o.propose('margin', 0.3, 100, 'AUTONOMOUS', NOW);
    expect(o.evaluate(100, NOW + 2000)).toMatchObject({ outcome: 'reverted', reason: 'no-improvement' });
    expect(o.propose('margin', 0.3, 100, 'AUTONOMOUS', NOW + 2500).started).toBe(true);
    expect(o.abort(NOW + 2600)).toBe(true);
    expect(o.abort(NOW + 2700)).toBe(false);
    expect(o.propose('margin', 0.3, 100, 'AUTONOMOUS', NOW + 2800).reason).toBe('cooldown');
    expect(o.propose('margin', 0.3, 100, 'AUTONOMOUS', NOW + 9_000).reason).toBe('daily-change-budget-exhausted');
    expect(() => new BoundedParameterOptimizer([{ name: 'x', value: 5, min: 0, max: 1, maxStep: 1 }])).toThrow(/invalid/);
    expect(new BoundedParameterOptimizer([]).evaluate(1, NOW).outcome).toBe('no-trial');
  });
});

const res = (id: string, kind: FabricResource['kind'], o: Partial<FabricResource> = {}): FabricResource => ({
  id, kind, state: 'HEALTHY', health: { status: 'healthy', score: 90, checkedAt: iso() }, confidence: 0.9, observedAt: iso(), trust: 0.9,
  capacity: {}, cost: {}, owner: 'o', failureDomains: [], lifecycle: 'active', capabilities: [], metadata: {}, ...o,
});

describe('Phase 125 — digital twin', () => {
  const snapshot = {
    resources: [res('routeA', 'Route', { failureDomains: ['isp1'], health: { status: 'healthy', score: 95, checkedAt: iso() } }), res('routeB', 'Route', { failureDomains: ['isp2'], health: { status: 'healthy', score: 80, checkedAt: iso() } }), res('dest', 'Destination')],
    edges: [{ from: 'dest', to: 'routeA', relation: 'via' }, { from: 'dest', to: 'routeB', relation: 'via' }],
  };
  it('reroutes when the preferred route fails and never touches the input', async () => {
    const before = JSON.stringify(snapshot);
    const impact = await simulateChanges(snapshot, [{ type: 'fail', resourceId: 'routeA' }], { kind: 'Route' }, iso());
    expect(impact).toMatchObject({ verdict: 'reroute', selectionChanged: true, before: { selectedId: 'routeA' }, after: { selectedId: 'routeB' } });
    expect(impact.lostSelectable).toEqual(['routeA']);
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  it('reports outage, degraded redundancy and no impact', async () => {
    const out = await simulateChanges(snapshot, [{ type: 'fail-domain', failureDomain: 'isp1' }, { type: 'fail-domain', failureDomain: 'isp2' }], { kind: 'Route' }, iso());
    expect(out.verdict).toBe('outage');
    expect(out.strandedDependents).toEqual(['dest']);
    const deg = await simulateChanges(snapshot, [{ type: 'fail', resourceId: 'routeB' }], { kind: 'Route' }, iso());
    expect(deg.verdict).toBe('degraded-redundancy');
    expect(deg.newSinglePointsOfFailure).toContain('routeA');
    const none = await simulateChanges(snapshot, [{ type: 'set-cost', resourceId: 'routeB', cost: { latencyMs: 1 } }], { kind: 'Route' }, iso());
    expect(none.verdict).toBe('no-impact');
    const worse = await simulateChanges(snapshot, [{ type: 'degrade', resourceId: 'routeA', healthScore: 10 }], { kind: 'Route' }, iso());
    expect(worse.after.selectedId).toBe('routeB');
  });
  it('rejects changes to unknown resources', async () => {
    await expect(simulateChanges(snapshot, [{ type: 'fail', resourceId: 'ghost' }], {}, iso())).rejects.toThrow(/unknown resource/);
    await expect(simulateChanges(snapshot, [{ type: 'fail-domain', failureDomain: 'nope' }], {}, iso())).rejects.toThrow(/no resources/);
  });
});

describe('Phase 126 — chaos & HIL validation', () => {
  const rig = () => {
    const calls: string[] = [];
    const port: FaultInjectionPort = { inject: async (f, t) => { calls.push(`inject:${f}:${t.join(',')}`); }, restore: async () => { calls.push('restore'); } };
    return { port, calls };
  };
  const experiment = (o: Partial<ChaosExperiment> = {}): ChaosExperiment => ({
    id: 'e1', environment: 'lab', fault: 'route-failure', targets: ['r1'], durationMs: 30, maxTargets: 2, pollMs: 5,
    steadyState: [{ name: 'reachable', check: () => ({ ok: true }) }], ...o,
  });
  it('passes when steady state holds and always restores', async () => {
    const { port, calls } = rig();
    const r = await runChaosExperiment(experiment(), port);
    expect(r).toMatchObject({ status: 'passed', restored: true });
    expect(calls).toEqual(['inject:route-failure:r1', 'restore']);
  });
  it('refuses unsafe or unproven experiments before injecting anything', async () => {
    const { port, calls } = rig();
    expect(validateExperiment(experiment({ environment: 'production' }))).toEqual(['production-requires-approval', 'production-blast-radius-limited-to-one']);
    expect((await runChaosExperiment(experiment({ targets: ['a', 'b', 'c'] }), port)).reasons).toContain('blast-radius-exceeded');
    const unsteady = await runChaosExperiment(experiment({ steadyState: [{ name: 'already-down', check: () => ({ ok: false }) }] }), port);
    expect(unsteady).toMatchObject({ status: 'refused', steadyBefore: ['already-down'] });
    expect(calls).toEqual([]);
  });
  it('aborts on abort conditions, restores, and fails the hypothesis when steady state is lost', async () => {
    const { port, calls } = rig();
    const aborted = await runChaosExperiment(experiment({ abortOn: [{ name: 'customer-impact', check: () => ({ ok: false }) }] }), port);
    expect(aborted).toMatchObject({ status: 'aborted', violations: ['abort:customer-impact'], restored: true });
    expect(calls.at(-1)).toBe('restore');
    let healthy = true;
    const flaky = experiment({ steadyState: [{ name: 'svc', check: () => ({ ok: healthy }) }] });
    const p2: FaultInjectionPort = { inject: async () => { healthy = true; }, restore: async () => { healthy = false; } };
    expect((await runChaosExperiment(flaky, p2)).status).toBe('failed-hypothesis');
  });
  it('restores after injection failure and reports a failed restore', async () => {
    const calls: string[] = [];
    const failing: FaultInjectionPort = { inject: async () => { throw new Error('rig offline'); }, restore: async () => { calls.push('restore'); } };
    expect(await runChaosExperiment(experiment(), failing)).toMatchObject({ status: 'inject-failed', reasons: ['rig offline'], restored: true });
    const stuck: FaultInjectionPort = { inject: async () => undefined, restore: async () => { throw new Error('stuck'); } };
    expect(await runChaosExperiment(experiment(), stuck)).toMatchObject({ status: 'aborted', reasons: ['restore-failed'], restored: false });
    const ctl = new AbortController(); ctl.abort();
    expect((await runChaosExperiment(experiment(), rig().port, { signal: ctl.signal })).status).toBe('aborted');
  });
});

describe('Phase 127 — release readiness', () => {
  const sha = 'a'.repeat(40); const other = 'b'.repeat(40);
  const ev = (gate: string, o: Partial<GateEvidence> = {}): GateEvidence => ({ gate, sha, source: 'ci', result: 'pass', recordedAtMs: NOW - 1000, reference: `run-${gate}`, ...o });
  const full = [
    ev('typecheck-and-unit'), ev('architecture-guards'), ev('linux-runtime-soak', { source: 'runtime-lab' }), ev('security-review', { source: 'security-review' }),
    ev('release-signing', { source: 'release-signing' }), ev('regional-validation', { source: 'device' }),
  ];
  it('is ready only when every required gate has exact-SHA, fresh, trusted, passing evidence', () => {
    expect(evaluateReleaseReadiness(sha, full, NOW)).toMatchObject({ verdict: 'ready', blockers: [] });
  });
  it('blocks on missing, stale, mismatched, untrusted, failed and skipped evidence', () => {
    const r = evaluateReleaseReadiness(sha, [
      ev('typecheck-and-unit', { sha: other }), ev('architecture-guards', { recordedAtMs: NOW - 30 * 86_400_000 }), ev('linux-runtime-soak', { source: 'ci' }),
      ev('security-review', { source: 'security-review', result: 'fail' }), ev('release-signing', { source: 'release-signing', result: 'skipped' }),
    ], NOW);
    expect(r.verdict).toBe('blocked');
    expect(r.blockers).toEqual(['typecheck-and-unit:sha-mismatch', 'architecture-guards:stale', 'linux-runtime-soak:untrusted-source', 'security-review:failed', 'release-signing:skipped']);
    expect(r.warnings).toEqual(['regional-validation:missing']);
  });
  it('treats optional gates as warnings, uses the newest evidence and validates the SHA', () => {
    const noOptional = full.filter((e) => e.gate !== 'regional-validation');
    expect(evaluateReleaseReadiness(sha, noOptional, NOW).verdict).toBe('ready-with-warnings');
    const recovered = [ev('typecheck-and-unit', { result: 'fail', recordedAtMs: NOW - 5000 }), ...full];
    expect(evaluateReleaseReadiness(sha, recovered, NOW).verdict).toBe('ready');
    expect(() => evaluateReleaseReadiness('abc123', full, NOW)).toThrow(/40-character/);
  });
});
