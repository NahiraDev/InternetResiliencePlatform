import { describe, expect, it } from 'vitest';
import {
  HEALTH_SCOPES,
  buildHealthReport,
  verifyOutcome,
  type ScopedHealthSignal,
  type OutcomeProbe,
} from '../src/verification/outcome-verification.js';
import {
  AdaptiveControlIntensity,
  CONTROL_INTENSITIES,
  classifyFailureLayer,
} from '../src/learning/adaptive-control.js';
import {
  StrategyOutcomeEstimator,
  selectAlternateStrategy,
  type StrategyCandidate,
} from '../src/learning/strategy-outcome.js';
import { OutcomeLearningLoop } from '../src/learning/outcome-learning-loop.js';
import { KnowledgeStore } from '../src/knowledge/knowledge-store.js';
import { DecayingFailureMemory } from '../src/knowledge/failure-memory.js';

const T0 = Date.parse('2026-10-03T00:00:00.000Z');
const iso = (offset = 0) => new Date(T0 + offset).toISOString();

const signal = (over: Partial<ScopedHealthSignal> = {}): ScopedHealthSignal => ({
  scope: 'destination',
  subjectId: 'a.test',
  status: 'failed',
  confidence: 1,
  observedAt: iso(),
  ...over,
});

const probe = (
  reachable: boolean,
  scope: OutcomeProbe['scope'] = 'destination',
  subjectId = 'a.test',
): OutcomeProbe => ({
  scope,
  subjectId,
  probe: async () => ({ reachable, latencyMs: 12 }),
});

const candidate = (id: string, over: Partial<StrategyCandidate> = {}): StrategyCandidate => ({
  id,
  intent: 'connectivity_failover',
  ...over,
});

describe('#279 t1: outcome verification, not return codes', () => {
  it('verifies when every probe succeeds', async () => {
    const result = await verifyOutcome(
      {
        correlationId: 'c',
        planId: 'p',
        expectedPostconditions: ['reachable'],
        actionStatus: 'success',
        probes: [probe(true), probe(true, 'service', 'api'), probe(true, 'application', 'checkout')],
      },
      T0,
    );
    expect(result.outcomeVerified).toBe(true);
    expect(result.verifiedPostconditions).toEqual(['reachable']);
  });

  it('fails when the action succeeded but the destination is unreachable', async () => {
    const result = await verifyOutcome(
      {
        correlationId: 'c',
        planId: 'p',
        expectedPostconditions: ['reachable'],
        actionStatus: 'success',
        probes: [probe(false)],
      },
      T0,
    );
    expect(result.outcomeVerified).toBe(false);
    expect(result.actionSucceededButOutcomeFailed).toBe(true);
  });

  it('treats a throwing probe as unreachable rather than crashing', async () => {
    const result = await verifyOutcome(
      {
        correlationId: 'c',
        planId: 'p',
        expectedPostconditions: ['reachable'],
        actionStatus: 'success',
        probes: [{ scope: 'destination', subjectId: 'a.test', probe: async () => { throw new Error('dns-timeout'); } }],
      },
      T0,
    );
    expect(result.outcomeVerified).toBe(false);
    expect(result.probeResults[0]?.error).toBe('dns-timeout');
  });

  it('never claims verification with no probes', async () => {
    const result = await verifyOutcome(
      { correlationId: 'c', planId: 'p', expectedPostconditions: ['reachable'], actionStatus: 'success', probes: [] },
      T0,
    );
    expect(result.outcomeVerified).toBe(false);
    expect(result.health.byScope.destination).toBe('unknown');
  });

  it('does not verify when the action itself failed', async () => {
    const result = await verifyOutcome(
      { correlationId: 'c', planId: 'p', expectedPostconditions: [], actionStatus: 'failed', probes: [probe(true)] },
      T0,
    );
    expect(result.outcomeVerified).toBe(false);
    expect(result.actionSucceededButOutcomeFailed).toBe(false);
  });

  it('records a failed outcome as terminal', async () => {
    const result = await verifyOutcome(
      { correlationId: 'c', planId: 'p', expectedPostconditions: [], actionStatus: 'success', probes: [probe(false)] },
      T0,
    );
    expect(result.terminal).toBe(true);
  });

  it('is deterministic in probe ordering', async () => {
    const input = {
      correlationId: 'c',
      planId: 'p',
      expectedPostconditions: [],
      actionStatus: 'success' as const,
      probes: [probe(true, 'application'), probe(false, 'destination')],
    };
    const a = await verifyOutcome(input, T0);
    const b = await verifyOutcome({ ...input, probes: [...input.probes].reverse() }, T0);
    expect(a.probeResults.map((p) => p.subjectId)).toEqual(b.probeResults.map((p) => p.subjectId));
  });
});

describe('#279 t2: nine health scopes', () => {
  it('declares every required scope', () => {
    expect([...HEALTH_SCOPES].sort()).toEqual(
      ['application', 'destination', 'path', 'provider', 'region', 'resource', 'service', 'transport', 'workload'].sort(),
    );
  });

  it('reports unknown for a scope with no signal', () => {
    const report = buildHealthReport([signal({ scope: 'destination', status: 'healthy' })]);
    expect(report.byScope.destination).toBe('healthy');
    expect(report.byScope.provider).toBe('unknown');
    expect(report.byScope.application).toBe('unknown');
  });

  it('takes the worst status within a scope', () => {
    const report = buildHealthReport([
      signal({ subjectId: 'a', status: 'healthy' }),
      signal({ subjectId: 'b', status: 'failed' }),
    ]);
    expect(report.byScope.destination).toBe('failed');
  });

  it('takes the worst scope as the overall verdict', () => {
    const report = buildHealthReport([
      signal({ scope: 'destination', status: 'healthy' }),
      signal({ scope: 'transport', subjectId: 'eth0', status: 'failed' }),
    ]);
    expect(report.overall).toBe('failed');
  });

  it('lists degraded and failed scopes with subjects', () => {
    const report = buildHealthReport([
      signal({ scope: 'destination', subjectId: 'a.test', status: 'degraded' }),
      signal({ scope: 'application', subjectId: 'checkout', status: 'failed' }),
    ]);
    expect(report.degradedScopes).toEqual([
      { scope: 'application', subjectId: 'checkout' },
      { scope: 'destination', subjectId: 'a.test' },
    ]);
  });

  it('never reports healthy while scopes are unmeasured', () => {
    // Missing evidence must not read as good news: `unknown` outranks healthy.
    const partial = buildHealthReport([signal({ status: 'healthy' })]);
    expect(partial.overall).toBe('unknown');
    const complete = buildHealthReport(
      HEALTH_SCOPES.map((scope) => signal({ scope, status: 'healthy' })),
    );
    expect(complete.overall).toBe('healthy');
  });
});

describe('#279 t4: failure classification by layer and domain', () => {
  it('classifies a transport failure as transport, not destination', () => {
    const health = buildHealthReport([
      signal({ scope: 'transport', subjectId: 'eth0', status: 'failed' }),
      signal({ scope: 'destination', subjectId: 'a.test', status: 'failed' }),
    ]);
    const classification = classifyFailureLayer(health);
    expect(classification.failedLayer).toBe('transport');
    expect(classification.widestAffectedScope).toBe('transport');
  });

  it('marks nested failures as correlated', () => {
    const health = buildHealthReport([
      signal({ scope: 'path', subjectId: 'p1', status: 'failed' }),
      signal({ scope: 'destination', subjectId: 'a.test', status: 'failed' }),
    ]);
    expect(classifyFailureLayer(health).correlated).toBe(true);
  });

  it('does not correlate when the outer scope is healthy', () => {
    // The application failed on its own: the destination is reachable, so
    // nothing outer explains it.
    const health = buildHealthReport([
      signal({ scope: 'destination', subjectId: 'a.test', status: 'healthy' }),
      signal({ scope: 'application', subjectId: 'checkout', status: 'failed' }),
    ]);
    const classification = classifyFailureLayer(health);
    expect(classification.failedLayer).toBe('application');
    expect(classification.correlated).toBe(false);
    expect(classification.healthyScopes).toContain('destination');
  });

  it('suggests moving outward when the transport fails', () => {
    const health = buildHealthReport([signal({ scope: 'transport', subjectId: 'eth0', status: 'failed' })]);
    expect(classifyFailureLayer(health).alternativeHint).toBe('path');
  });

  it('records the failure domain', () => {
    const health = buildHealthReport([signal({ status: 'failed', failureDomain: 'carrier-a' })]);
    expect(classifyFailureLayer(health, { failureDomain: 'carrier-a' }).failureDomain).toBe('carrier-a');
  });

  it('reports unknown layer when nothing failed', () => {
    expect(classifyFailureLayer(buildHealthReport([])).failedLayer).toBe('unknown');
  });
});

describe('#279 t3: adaptive control intensity', () => {
  it('starts at the configured intensity', () => {
    expect(new AdaptiveControlIntensity({ start: 'observe' }).snapshot().intensity).toBe('observe');
  });

  it('promotes only after consecutive verified successes', () => {
    const i = new AdaptiveControlIntensity({ promoteAfter: 3, ceiling: 'degraded', start: 'observe' });
    expect(i.recordSuccess().intensity).toBe('observe');
    expect(i.recordSuccess().intensity).toBe('observe');
    expect(i.recordSuccess().intensity).toBe('probe');
  });

  it('resets the success streak on failure', () => {
    const i = new AdaptiveControlIntensity({ promoteAfter: 3, demoteAfter: 2, ceiling: 'degraded' });
    i.recordSuccess();
    i.recordSuccess();
    i.recordFailure();
    expect(i.recordSuccess().consecutiveSuccesses).toBe(1);
  });

  it('demotes faster than it promotes', () => {
    const i = new AdaptiveControlIntensity({ promoteAfter: 3, demoteAfter: 2, ceiling: 'degraded' });
    i.recordFailure();
    i.recordFailure();
    expect(i.snapshot().intensity).toBe('observe');
  });

  it('never exceeds the ceiling even with endless successes', () => {
    const i = new AdaptiveControlIntensity({ promoteAfter: 1, ceiling: 'degraded' });
    for (let n = 0; n < 50; n += 1) i.recordSuccess();
    expect(i.snapshot().intensity).toBe('degraded');
  });

  it('never reaches autonomous by learning alone', () => {
    const i = new AdaptiveControlIntensity({ promoteAfter: 1, ceiling: 'degraded' });
    for (let n = 0; n < 200; n += 1) i.recordSuccess();
    expect(CONTROL_INTENSITIES).toContain('autonomous');
    expect(i.snapshot().intensity).not.toBe('autonomous');
  });

  it('resets to its starting point', () => {
    const i = new AdaptiveControlIntensity({ promoteAfter: 1, ceiling: 'degraded' });
    i.recordSuccess();
    i.recordSuccess();
    expect(i.reset().intensity).toBe('observe');
  });
});

describe('#279 t8: strategy success/failure estimates', () => {
  it('starts from a prior that favours success', () => {
    const estimate = new StrategyOutcomeEstimator().estimate('s1');
    expect(estimate.successRate).toBeGreaterThan(0.5);
    expect(estimate.lowConfidence).toBe(true);
  });

  it('falls after verified failures', () => {
    const e = new StrategyOutcomeEstimator();
    e.record('s1', false);
    e.record('s1', false);
    expect(e.estimate('s1').successRate).toBeLessThan(0.5);
  });

  it('rises after verified successes', () => {
    const e = new StrategyOutcomeEstimator();
    for (let n = 0; n < 5; n += 1) e.record('s1', true);
    expect(e.estimate('s1').successRate).toBeGreaterThan(0.5);
  });

  it('marks a well-observed strategy as confident', () => {
    const e = new StrategyOutcomeEstimator();
    for (let n = 0; n < 5; n += 1) e.record('s1', true);
    expect(e.estimate('s1').lowConfidence).toBe(false);
  });

  it('lets old outcomes decay so recent results dominate', () => {
    let now = T0;
    const e = new StrategyOutcomeEstimator({ halfLifeMs: 1000, nowMs: () => now });
    for (let n = 0; n < 5; n += 1) e.record('s1', false, now);
    const afterFailures = e.estimate('s1').successRate;
    now += 20 * 1000;
    e.record('s1', true, now);
    expect(e.estimate('s1').successRate).toBeGreaterThan(afterFailures);
  });

  it('prunes outcomes past retention', () => {
    let now = T0;
    const e = new StrategyOutcomeEstimator({ nowMs: () => now });
    e.record('s1', true, now);
    now += 10_000;
    expect(e.prune(5_000)).toBe(1);
    expect(e.size()).toBe(0);
  });
});

describe('#279 t5: alternate strategy selection, never blind retry', () => {
  it('excludes the strategy that just failed', () => {
    const selection = selectAlternateStrategy({
      failed: candidate('failed'),
      candidates: [candidate('failed'), candidate('alt-a')],
    });
    expect(selection.selected?.id).toBe('alt-a');
    expect(selection.rejected.map((r) => r.reason)).toContain('already-failed');
  });

  it('refuses to retry when no alternate exists', () => {
    const selection = selectAlternateStrategy({
      failed: candidate('only'),
      candidates: [candidate('only')],
    });
    expect(selection.selected).toBeUndefined();
    expect(selection.rejected.map((r) => r.reason)).toContain('no-alternate-available');
  });

  it('skips a quarantined strategy while an eligible one exists', () => {
    const selection = selectAlternateStrategy({
      failed: candidate('failed'),
      candidates: [candidate('quarantined'), candidate('good')],
      quarantined: new Set(['quarantined']),
    });
    expect(selection.selected?.id).toBe('good');
    expect(selection.rejected.map((r) => r.reason)).toContain('quarantined');
  });

  it('prefers the highest estimated success rate', () => {
    const estimator = new StrategyOutcomeEstimator();
    for (let n = 0; n < 4; n += 1) estimator.record('weak', false);
    for (let n = 0; n < 4; n += 1) estimator.record('strong', true);
    const selection = selectAlternateStrategy({
      failed: candidate('failed'),
      candidates: [candidate('weak'), candidate('strong')],
      estimator,
    });
    expect(selection.selected?.id).toBe('strong');
  });

  it('honours a preferred layer when candidates target one', () => {
    const selection = selectAlternateStrategy({
      failed: candidate('failed', { targetLayer: 'destination' }),
      candidates: [
        candidate('dest-again', { targetLayer: 'destination' }),
        candidate('path-alt', { targetLayer: 'path' }),
      ],
      preferredLayer: 'path',
    });
    expect(selection.selected?.id).toBe('path-alt');
  });

  it('falls back to any eligible candidate when the layer has none', () => {
    const selection = selectAlternateStrategy({
      failed: candidate('failed', { targetLayer: 'transport' }),
      candidates: [candidate('other', { targetLayer: 'destination' })],
      preferredLayer: 'path',
    });
    expect(selection.selected?.id).toBe('other');
  });

  it('is deterministic for equal estimates', () => {
    const forward = selectAlternateStrategy({
      failed: candidate('f'),
      candidates: [candidate('b'), candidate('a')],
    });
    const reverse = selectAlternateStrategy({
      failed: candidate('f'),
      candidates: [candidate('a'), candidate('b')],
    });
    expect(forward.selected?.id).toBe(reverse.selected?.id);
  });

  it('explains its choice', () => {
    const selection = selectAlternateStrategy({
      failed: candidate('failed'),
      candidates: [candidate('alt')],
    });
    expect(selection.rationale).toContain('failed strategy');
    expect(selection.rationale).toContain('alt');
  });
});

describe('#279 t6: rollback outcome verification', () => {
  it('verifies a rollback by re-probing, not by return code', async () => {
    const loop = new OutcomeLearningLoop({ nowMs: () => T0 });
    const result = await loop.verifyRollbackOutcome({
      correlationId: 'c',
      planId: 'p',
      expectedPostconditions: ['restored'],
      actionStatus: 'success',
      probes: [probe(true)],
    });
    expect(result.metadata.rollbackVerification).toBe(true);
    expect(result.outcomeVerified).toBe(true);
  });

  it('fails a rollback whose destination is still unreachable', async () => {
    const loop = new OutcomeLearningLoop({ nowMs: () => T0 });
    const result = await loop.verifyRollbackOutcome({
      correlationId: 'c',
      planId: 'p',
      expectedPostconditions: ['restored'],
      actionStatus: 'success',
      probes: [probe(false)],
    });
    expect(result.outcomeVerified).toBe(false);
  });
});

describe('#279 t7,t8,t9,t10: the learning loop', () => {
  const loopWith = (options = {}) => new OutcomeLearningLoop({ nowMs: () => T0, ...options });

  const verified = async (reachable = true) =>
    verifyOutcome(
      {
        correlationId: 'c',
        planId: 'p',
        expectedPostconditions: ['reachable'],
        actionStatus: 'success',
        probes: [probe(reachable)],
      },
      T0,
    );

  it('records decision, transaction and outcome evidence', async () => {
    const loop = loopWith();
    loop.record({ kind: 'decision', correlationId: 'c', verified: true, summary: 'chose failover', detail: {} });
    loop.record({ kind: 'transaction', correlationId: 'c', verified: true, summary: 'applied', detail: {} });
    await loop.learn({ verification: await verified(), strategyId: 's1' });
    expect(loop.evidence().map((e) => e.kind)).toEqual(['decision', 'transaction', 'outcome']);
  });

  it('changes future selection through a verified outcome', async () => {
    const loop = loopWith();
    // A verified rollback means prior state was confirmed restored, so the
    // outcome is verified while the strategy still failed to achieve its goal.
    for (let n = 0; n < 3; n += 1) {
      loop.learn({ verification: await verified(true), strategyId: 'bad', rollback: true });
    }
    expect(loop.estimatorFor().estimate('bad').successRate).toBeLessThan(0.5);
  });

  it('never learns from an unverified outcome', async () => {
    const loop = loopWith();
    const update = loop.learn({ verification: await verified(false), strategyId: 's1' });
    expect(update.applied).toBe(false);
    expect(update.failureMemoryUpdated).toBe(false);
    expect(loop.estimatorFor().estimate('s1').verifiedOutcomes).toBe(0);
  });

  it('still records evidence for an unverified outcome', async () => {
    const loop = loopWith();
    loop.learn({ verification: await verified(false), strategyId: 's1' });
    expect(loop.evidence()).toHaveLength(1);
    expect(loop.evidence()[0]!.verified).toBe(false);
  });

  it('updates failure memory on a verified rollback', async () => {
    const failureMemory = new DecayingFailureMemory();
    const loop = loopWith({ failureMemory });
    const update = loop.learn({
      verification: await verified(true),
      strategyId: 's1',
      quarantineKey: 's1',
      rollback: true,
    });
    expect(update.failureMemoryUpdated).toBe(true);
    expect(failureMemory.quarantineFor('s1', {}, T0).failureCount).toBe(1);
  });

  it('counts a verified rollback as a strategy failure', async () => {
    const loop = new OutcomeLearningLoop({
      nowMs: () => T0,
      estimator: new StrategyOutcomeEstimator({ nowMs: () => T0 }),
    });
    const update = loop.learn({ verification: await verified(true), strategyId: 's1', rollback: true });
    // Prior is 2:1, so one failure moves the mean to exactly 0.5.
    expect(update.estimateUpdated!.successRate).toBeLessThanOrEqual(0.5);
  });

  it('raises the estimate on a verified success', async () => {
    const loop = loopWith();
    const update = loop.learn({ verification: await verified(true), strategyId: 's1' });
    expect(update.estimateUpdated!.successRate).toBeGreaterThan(0.5);
  });

  it('reports the failure classification from the outcome', async () => {
    const loop = loopWith();
    const verification = await verifyOutcome(
      {
        correlationId: 'c',
        planId: 'p',
        expectedPostconditions: [],
        actionStatus: 'success',
        probes: [probe(false, 'transport', 'eth0'), probe(false, 'destination')],
      },
      T0,
    );
    const update = loop.learn({ verification });
    expect(update.classification!.failedLayer).toBe('transport');
  });

  it('applies knowledge decay', async () => {
    const store = new KnowledgeStore({ nowMs: () => T0 });
    store.record({
      kind: 'measurement',
      source: 'measurement',
      provenance: { producer: 'p', source: 'measurement' },
      observedAt: iso(-10_000),
      confidence: 0.9,
      halfLifeMs: 1_000,
      expiresAt: iso(60_000),
      correlationId: 'c',
      objectiveEvidence: { latency: 0.5 },
    });
    const loop = loopWith({ knowledgeStore: store });
    const update = loop.learn({ verification: await verified(true), strategyId: 's1' });
    expect(update.knowledgeDecayed).toBe(1);
  });

  it('does not count non-decaying knowledge as decayed', async () => {
    const store = new KnowledgeStore({ nowMs: () => T0 });
    store.record({
      kind: 'measurement',
      source: 'measurement',
      provenance: { producer: 'p', source: 'measurement' },
      observedAt: iso(-10_000),
      confidence: 0.9,
      correlationId: 'c',
    });
    const loop = loopWith({ knowledgeStore: store });
    expect(loop.learn({ verification: await verified(true) }).knowledgeDecayed).toBe(0);
  });

  it('bounds the evidence ledger', async () => {
    const loop = loopWith({ maxEvidence: 3 });
    for (let n = 0; n < 10; n += 1) {
      loop.record({ kind: 'outcome', correlationId: 'c', verified: true, summary: `e${n}`, detail: {} });
    }
    expect(loop.evidence()).toHaveLength(3);
    expect(loop.evidence()[2]!.summary).toBe('e9');
  });

  it('prunes evidence past retention', () => {
    let now = T0;
    const loop = new OutcomeLearningLoop({ nowMs: () => now, evidenceRetentionMs: 1_000 });
    loop.record({ kind: 'outcome', correlationId: 'c', verified: true, summary: 'old', detail: {} });
    now += 5_000;
    expect(loop.prune()).toBe(1);
  });

  it('is observable via a full snapshot', async () => {
    const loop = loopWith();
    await loop.learn({ verification: await verified(true), strategyId: 's1' });
    const snapshot = loop.snapshot();
    expect(snapshot.evidenceCount).toBe(1);
    expect(snapshot.reversible).toBe(true);
    expect(snapshot.recordedOutcomes).toBe(1);
    expect(snapshot.maxEvidence).toBeGreaterThan(0);
  });

  it('is reversible and records what to restore', async () => {
    const loop = loopWith();
    const update = loop.learn({ verification: await verified(true), strategyId: 's1' });
    expect(update.undo.reversible).toBe(true);
    expect(update.undo.priorIntensity).toBeDefined();
    const undone = loop.undo();
    expect(undone?.reversible).toBe(true);
    expect(undone?.description).toContain('reverse');
  });

  it('undo with nothing applied returns undefined', () => {
    expect(new OutcomeLearningLoop().undo()).toBeUndefined();
  });

  it('explains every applied update', async () => {
    const loop = loopWith();
    const update = loop.learn({ verification: await verified(true), strategyId: 's1' });
    expect(update.rationale).toContain('verified outcome applied');
  });

  it('explains an unverified update without learning', async () => {
    const update = new OutcomeLearningLoop().learn({ verification: await verified(false), strategyId: 's1' });
    expect(update.rationale).toContain('not verified');
  });
});