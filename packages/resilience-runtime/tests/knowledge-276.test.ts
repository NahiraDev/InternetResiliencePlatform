import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_KINDS,
  KNOWLEDGE_SOURCES,
  KnowledgeValidationError,
  createKnowledgeRecord,
  decayedConfidence,
  isAdvisoryOnly,
  isExpired,
  scopeMatches,
} from '../src/knowledge/knowledge-record.js';
import { arbitrateKnowledge, explainArbitration } from '../src/knowledge/arbitration.js';
import { KnowledgeStore, recordOutcome } from '../src/knowledge/knowledge-store.js';
import { DecayingFailureMemory } from '../src/knowledge/failure-memory.js';
import { fusePredictions, predictiveSignalRecord } from '../src/knowledge/prediction.js';
import {
  knowledgeEvidenceFunction,
  knowledgeInfluenceFor,
  mergeKnowledgeEvidence,
  neutralEvidence,
} from '../src/knowledge/knowledge-influence.js';
import { defaultEvidenceFor } from '../src/planning/objectives.js';
import { DeterministicPlanner } from '../src/planning/planner.js';
import type { CandidateAction, RuntimeContext } from '../src/domain/types.js';

const T0 = Date.parse('2026-10-03T00:00:00.000Z');
const iso = (offsetMs = 0) => new Date(T0 + offsetMs).toISOString();

const record = (over: Partial<Parameters<typeof createKnowledgeRecord>[0]> = {}) =>
  createKnowledgeRecord({
    kind: 'measurement',
    source: 'measurement',
    provenance: { producer: 'test', source: 'measurement', trustLevel: 'verified' },
    observedAt: iso(),
    confidence: 0.9,
    correlationId: 'corr-276',
    ...over,
  } as Parameters<typeof createKnowledgeRecord>[0]);

const candidate = (over: Partial<CandidateAction> = {}): CandidateAction =>
  ({
    id: 'cand-1',
    schemaVersion: 1,
    createdAt: iso(),
    correlationId: 'corr-276',
    source: 'resilience-runtime',
    metadata: {},
    intent: 'connectivity_failover',
    expectedBenefit: 0.5,
    risk: 0.5,
    confidence: 0.8,
    requiredCapabilities: [],
    dependencies: [],
    postconditions: [],
    verificationRequirements: [],
    rejectionReasons: [],
    ...over,
  }) as CandidateAction;

describe('#276 t3: seven epistemic kinds', () => {
  it('distinguishes exactly the required kinds', () => {
    expect([...KNOWLEDGE_KINDS].sort()).toEqual(
      ['decision', 'hypothesis', 'inference', 'measurement', 'observation', 'outcome', 'prediction'].sort(),
    );
  });

  it('covers every required evidence family', () => {
    for (const source of [
      'observation',
      'measurement',
      'topology',
      'history',
      'failure-memory',
      'destination',
      'provider',
      'federated',
    ] as const) {
      expect(KNOWLEDGE_SOURCES).toContain(source);
    }
  });

  it('keeps the kind on the record so a prediction is not an observation', () => {
    expect(record({ kind: 'prediction', expiresAt: iso(60_000) }).kind).toBe('prediction');
    expect(record({ kind: 'hypothesis' }).kind).toBe('hypothesis');
  });

  it('requires predictions to declare an expiry', () => {
    expect(() => record({ kind: 'prediction' })).toThrow(KnowledgeValidationError);
    expect(record({ kind: 'prediction', expiresAt: iso(60_000) }).kind).toBe('prediction');
  });
});

describe('#276 t2: provenance, freshness, confidence, scope, corroboration, expiration', () => {
  it('attaches every required attribute', () => {
    const r = record({
      scope: { destination: 'example.test' },
      expiresAt: iso(3_600_000),
      halfLifeMs: 600_000,
      corroborations: ['k2', 'k3'],
    });
    expect(r.provenance.producer).toBe('test');
    expect(r.provenance.source).toBe('measurement');
    expect(r.observedAt).toBe(iso());
    expect(r.expiresAt).toBe(iso(3_600_000));
    expect(r.confidence).toBe(0.9);
    expect(r.scope.destination).toBe('example.test');
    expect(r.corroborations).toEqual(['k2', 'k3']);
    expect(r.halfLifeMs).toBe(600_000);
  });

  it('rejects invalid timestamps, confidence and half-life', () => {
    expect(() => record({ observedAt: 'not-a-date' })).toThrow(KnowledgeValidationError);
    expect(() => record({ expiresAt: 'not-a-date' })).toThrow(KnowledgeValidationError);
    expect(() => record({ expiresAt: iso(-1) })).toThrow(KnowledgeValidationError);
    expect(() => record({ confidence: 1.5 })).toThrow(KnowledgeValidationError);
    expect(() => record({ confidence: Number.NaN })).toThrow(KnowledgeValidationError);
    expect(() => record({ halfLifeMs: 0 })).toThrow(KnowledgeValidationError);
    expect(() => record({ objectiveEvidence: { latency: Number.NaN } })).toThrow(
      KnowledgeValidationError,
    );
  });

  it('decays confidence over the half-life', () => {
    const r = record({ halfLifeMs: 1_000, confidence: 1, expiresAt: iso(60_000) });
    expect(decayedConfidence(r, T0)).toBe(1);
    expect(decayedConfidence(r, T0 + 1_000)).toBeCloseTo(0.5, 6);
    expect(decayedConfidence(r, T0 + 2_000)).toBeCloseTo(0.25, 6);
  });

  it('reports expiry and zero confidence past it', () => {
    const r = record({ expiresAt: iso(1_000) });
    expect(isExpired(r, T0 + 500)).toBe(false);
    expect(isExpired(r, T0 + 1_500)).toBe(true);
    expect(decayedConfidence(r, T0 + 5_000)).toBe(0);
  });

  it('matches scope only when declared fields agree', () => {
    expect(scopeMatches({}, { destination: 'a' })).toBe(true);
    expect(scopeMatches({ destination: 'a' }, { destination: 'a' })).toBe(true);
    expect(scopeMatches({ destination: 'a' }, { destination: 'b' })).toBe(false);
    expect(scopeMatches({ providerId: 'p1' }, { destination: 'a', providerId: 'p2' })).toBe(false);
  });

  it('marks history and federated knowledge advisory-only', () => {
    expect(isAdvisoryOnly('federated')).toBe(true);
    expect(isAdvisoryOnly('history')).toBe(true);
    expect(isAdvisoryOnly('measurement')).toBe(false);
  });
});

describe('#276 t4: deterministic evidence/confidence arbitration', () => {
  it('aggregates objective evidence as a weighted mean', () => {
    const result = arbitrateKnowledge([
      record({ objectiveEvidence: { latency: 1 }, confidence: 0.9 }),
      record({ objectiveEvidence: { latency: 0 }, confidence: 0.1 }),
    ], { nowMs: T0 });
    expect(result.evidence.latency).toBeGreaterThan(0.5);
    expect(result.evidence.latency).toBeLessThan(1);
  });

  it('is deterministic regardless of input order', () => {
    const a = record({ id: undefined, objectiveEvidence: { latency: 0.2 }, confidence: 0.5 }) as never;
    const b = record({ objectiveEvidence: { latency: 0.9 }, confidence: 0.9 });
    const forward = arbitrateKnowledge([a, b], { nowMs: T0 });
    const reverse = arbitrateKnowledge([b, a], { nowMs: T0 });
    expect(forward.evidence.latency).toBeCloseTo(reverse.evidence.latency, 12);
    expect(forward.contributions.map((c) => c.knowledgeId)).toEqual(
      reverse.contributions.map((c) => c.knowledgeId),
    );
  });

  it('weights trusted local measurement above federated evidence', () => {
    const result = arbitrateKnowledge([
      record({ objectiveEvidence: { latency: 1 }, source: 'measurement', confidence: 0.5 }),
      record({
        objectiveEvidence: { latency: 0 },
        source: 'federated',
        confidence: 1,
        provenance: { producer: 'peer', source: 'federated', signature: 'sig', trustLevel: 'verified' },
      }),
    ], { nowMs: T0 });
    expect(result.evidence.latency).toBeGreaterThan(0.5);
  });

  it('rejects expired, scoped-out, unsigned and untrusted evidence', () => {
    const result = arbitrateKnowledge(
      [
        record({ expiresAt: iso(1_000), objectiveEvidence: { latency: 1 } }),
        record({ scope: { destination: 'other.test' }, objectiveEvidence: { latency: 1 } }),
        record({
          source: 'federated',
          objectiveEvidence: { latency: 1 },
          provenance: { producer: 'peer', source: 'federated', signature: undefined },
        }),
        record({
          source: 'federated',
          objectiveEvidence: { latency: 1 },
          provenance: { producer: 'peer', source: 'federated', signature: 'sig', trustLevel: 'untrusted' },
        }),
      ],
      { nowMs: T0 + 5_000, scope: { destination: 'example.test' } },
    );
    const reasons = result.rejected.map((r) => r.reason);
    expect(reasons).toContain('expired');
    expect(reasons).toContain('scope-mismatch');
    expect(reasons).toContain('unsigned-federation');
    expect(reasons).toContain('untrusted-federation');
    expect(result.evidence.latency).toBeUndefined();
  });

  it('accepts signed, trusted federated evidence', () => {
    const result = arbitrateKnowledge(
      [
        record({
          source: 'federated',
          objectiveEvidence: { latency: 0.4 },
          provenance: { producer: 'peer', source: 'federated', signature: 'sig', trustLevel: 'verified' },
        }),
      ],
      { nowMs: T0 },
    );
    expect(result.evidence.latency).toBeCloseTo(0.4, 6);
  });

  it('rejects records carrying no evidence', () => {
    const result = arbitrateKnowledge([record({})], { nowMs: T0 });
    expect(result.rejected.map((r) => r.reason)).toContain('no-evidence');
  });

  it('rejects non-finite evidence at construction time', () => {
    expect(() => record({ objectiveEvidence: { latency: Number.POSITIVE_INFINITY } })).toThrow(
      KnowledgeValidationError,
    );
  });

  it('also rejects non-finite evidence that reached arbitration by tampering', () => {
    const tampered = {
      ...record({ objectiveEvidence: { latency: 1 } }),
      objectiveEvidence: { latency: Number.NaN },
    };
    const result = arbitrateKnowledge([tampered], { nowMs: T0 });
    expect(result.rejected.map((r) => r.reason)).toContain('non-finite-evidence');
  });

  it('boosts weight but never the value via corroboration', () => {
    const alone = arbitrateKnowledge(
      [record({ objectiveEvidence: { latency: 0.3 }, confidence: 0.9 })],
      { nowMs: T0 },
    );
    const corroborated = arbitrateKnowledge(
      [
        record({
          objectiveEvidence: { latency: 0.3 },
          confidence: 0.9,
          corroborations: ['a', 'b'],
        }),
      ],
      { nowMs: T0 },
    );
    expect(corroborated.evidence.latency).toBeCloseTo(alone.evidence.latency!, 12);
    expect(corroborated.weights.latency!).toBeGreaterThan(alone.weights.latency!);
  });

  it('reports the advisory share so remote influence is visible', () => {
    const result = arbitrateKnowledge(
      [
        record({ source: 'measurement', objectiveEvidence: { latency: 1 }, confidence: 1 }),
        record({
          source: 'federated',
          objectiveEvidence: { latency: 1 },
          confidence: 1,
          provenance: { producer: 'peer', source: 'federated', signature: 'sig', trustLevel: 'verified' },
        }),
      ],
      { nowMs: T0 },
    );
    expect(result.advisoryShare).toBeGreaterThan(0);
    expect(result.advisoryShare).toBeLessThan(1);
  });

  it('returns an empty result for no records', () => {
    const result = arbitrateKnowledge([], { nowMs: T0 });
    expect(result.evidence).toEqual({});
    expect(result.contributions).toEqual([]);
  });

  it('explains itself', () => {
    const result = arbitrateKnowledge([record({ objectiveEvidence: { latency: 0.5 } })], { nowMs: T0 });
    expect(explainArbitration(result)).toContain('latency=0.500');
  });
});

describe('#276 t1: knowledge store combines evidence families', () => {
  it('ingests and indexes every family', () => {
    const store = new KnowledgeStore({ nowMs: () => T0 });
    for (const source of KNOWLEDGE_SOURCES) {
      store.record({
        kind: 'observation',
        source,
        provenance: { producer: 'p', source },
        observedAt: iso(),
        confidence: 0.7,
        correlationId: 'corr-276',
      });
    }
    const snapshot = store.snapshot();
    expect(snapshot.recordCount).toBe(KNOWLEDGE_SOURCES.length);
    expect(Object.keys(snapshot.bySource)).toHaveLength(KNOWLEDGE_SOURCES.length);
  });

  it('filters by source', () => {
    const store = new KnowledgeStore({ nowMs: () => T0 });
    store.record({
      kind: 'measurement',
      source: 'measurement',
      provenance: { producer: 'p', source: 'measurement' },
      observedAt: iso(),
      confidence: 0.8,
      correlationId: 'c',
    });
    store.record({
      kind: 'observation',
      source: 'federated',
      provenance: { producer: 'p', source: 'federated', signature: 's', trustLevel: 'verified' },
      observedAt: iso(),
      confidence: 0.8,
      correlationId: 'c',
    });
    expect(store.query({ sources: ['federated'] })).toHaveLength(1);
  });

  it('does not delete on read; prunes explicitly', () => {
    const store = new KnowledgeStore({ nowMs: () => T0 });
    store.record({
      kind: 'measurement',
      source: 'measurement',
      provenance: { producer: 'p', source: 'measurement' },
      observedAt: iso(),
      expiresAt: iso(1_000),
      confidence: 0.8,
      correlationId: 'c',
    });
    store.query({ nowMs: T0 + 5_000 });
    expect(store.size()).toBe(1);
    expect(store.pruneExpired(T0 + 5_000)).toBe(1);
    expect(store.size()).toBe(0);
  });

  it('evicts oldest records at capacity', () => {
    const store = new KnowledgeStore({ maxRecords: 2, nowMs: () => T0 });
    for (const offset of [0, 1_000, 2_000]) {
      store.record({
        kind: 'measurement',
        source: 'measurement',
        provenance: { producer: 'p', source: 'measurement' },
        observedAt: iso(offset),
        confidence: 0.8,
        correlationId: 'c',
      });
    }
    expect(store.size()).toBe(2);
    expect(store.query()[0]!.observedAt).toBe(iso(2_000));
  });

  it('records outcomes to close the loop', () => {
    const store = new KnowledgeStore({ nowMs: () => T0 });
    const outcome = recordOutcome(store, {
      correlationId: 'c',
      producer: 'verifier',
      succeeded: true,
      confidence: 0.95,
      objectiveEvidence: { reachability: 1 },
    });
    expect(outcome.kind).toBe('outcome');
    expect(outcome.detail?.succeeded).toBe(true);
  });

  it('arbitrates without throwing when the store is empty', () => {
    expect(() => new KnowledgeStore().arbitrate()).not.toThrow();
  });
});

describe('#276 t8: decaying failure memory and strategy quarantine', () => {
  const memory = () =>
    new DecayingFailureMemory({ halfLifeMs: 1_000, quarantineThreshold: 1, quarantinePenalty: 0.5 });

  it('penalises a strategy after failures', () => {
    const m = memory();
    expect(m.scoreMultiplier('s1')).toBe(1);
    m.recordFailure({ strategyId: 's1' });
    expect(m.scoreMultiplier('s1')).toBeLessThan(1);
  });

  it('decays the penalty back toward 1 over time', () => {
    const m = memory();
    m.recordFailure({ strategyId: 's1' });
    const base = Date.now();
    const fresh = m.scoreMultiplier('s1', {}, base);
    const later = m.scoreMultiplier('s1', {}, base + 10_000);
    expect(fresh).toBeLessThan(1);
    expect(later).toBeGreaterThan(fresh);
  });

  it('quarantines once the decayed weight crosses the threshold', () => {
    const m = new DecayingFailureMemory({ halfLifeMs: 1_000, quarantineThreshold: 1.0, quarantinePenalty: 0.5 });
    m.recordFailure({ strategyId: 's1' });
    m.recordFailure({ strategyId: 's1' });
    const state = m.quarantineFor('s1', {}, Date.now());
    expect(state.quarantined).toBe(true);
    expect(m.scoreMultiplier('s1')).toBe(0.5);
  });

  it('scopes failures to a destination', () => {
    const m = new DecayingFailureMemory({ halfLifeMs: 1_000, quarantineThreshold: 0.1 });
    m.recordFailure({ strategyId: 's1', destination: 'a.test' });
    expect(m.scoreMultiplier('s1', { destination: 'a.test' })).toBeLessThan(1);
    expect(m.scoreMultiplier('s1', { destination: 'b.test' })).toBe(1);
  });

  it('lists quarantined strategies for explainability', () => {
    const m = new DecayingFailureMemory({ halfLifeMs: 1_000, quarantineThreshold: 1.5, quarantinePenalty: 0.5 });
    m.recordFailure({ strategyId: 's1' });
    m.recordFailure({ strategyId: 's1' });
    m.recordFailure({ strategyId: 's2' });
    expect(m.quarantined().map((q) => q.strategyId)).toEqual(['s1']);
  });

  it('prunes failures past retention', () => {
    const m = new DecayingFailureMemory({ halfLifeMs: 1_000, retentionMs: 5_000 });
    m.recordFailure({ strategyId: 's1' });
    expect(m.prune(Date.now() + 10_000)).toBe(1);
    expect(m.scoreMultiplier('s1')).toBe(1);
  });

  it('never forbids a strategy outright', () => {
    const m = new DecayingFailureMemory({ halfLifeMs: 1_000, quarantineThreshold: 0.01, quarantinePenalty: 0 });
    m.recordFailure({ strategyId: 's1' });
    // Penalty bounded at 0..1; the module has no deny path, policy owns denial.
    expect(m.scoreMultiplier('s1')).toBeGreaterThanOrEqual(0);
  });

  it('snapshots state', () => {
    const m = memory();
    m.recordFailure({ strategyId: 's1' });
    expect(m.snapshot().strategies.map((s) => s.strategyId)).toEqual(['s1']);
  });
});

describe('#276 t7: predictive signals', () => {
  it('declares confidence and horizon', () => {
    const signal = fusePredictions(
      [
        predictiveSignalRecord({
          subjectId: 'path-1',
          pathId: 'path-1',
          direction: 'degrading',
          confidence: 0.8,
          horizonMs: 300_000,
          producer: 'forecaster',
          correlationId: 'c',
          objectiveEvidence: { stability: 0.2 },
          nowMs: T0,
        }),
      ],
      { subjectId: 'path-1', nowMs: T0 },
    );
    expect(signal).toBeDefined();
    expect(signal!.direction).toBe('degrading');
    expect(signal!.confidence).toBeGreaterThan(0);
    expect(signal!.horizonMs).toBe(300_000);
    expect(signal!.horizonEnd).toBe(iso(300_000));
  });

  it('refuses to fuse below the minimum confidence', () => {
    expect(
      fusePredictions(
        [
          predictiveSignalRecord({
            subjectId: 'p',
            pathId: 'p',
            direction: 'stable',
            confidence: 0.1,
            horizonMs: 60_000,
            producer: 'f',
            correlationId: 'c',
            nowMs: T0,
          }),
        ],
        { minConfidence: 0.5, subjectId: 'p', nowMs: T0 },
      ),
    ).toBeUndefined();
  });

  it('never fuses observations into a forecast', () => {
    expect(
      fusePredictions([record({ kind: 'observation', observedAt: iso() })], {
        subjectId: 'p',
        nowMs: T0,
      }),
    ).toBeUndefined();
  });

  it('weights by decayed confidence', () => {
    const strong = predictiveSignalRecord({
      subjectId: 'p',
      pathId: 'p',
      direction: 'degrading',
      confidence: 0.9,
      horizonMs: 300_000,
      producer: 'f',
      correlationId: 'c',
      objectiveEvidence: { stability: 0.1 },
      nowMs: T0,
    });
    const weak = predictiveSignalRecord({
      subjectId: 'p',
      pathId: 'p',
      direction: 'improving',
      confidence: 0.4,
      horizonMs: 300_000,
      producer: 'f',
      correlationId: 'c',
      objectiveEvidence: { stability: 0.9 },
      nowMs: T0,
    });
    const fused = fusePredictions([weak, strong], { subjectId: 'p', nowMs: T0 + 100_000 });
    expect(fused!.direction).toBe('degrading');
  });

  it('returns undefined with no eligible signals', () => {
    expect(fusePredictions([], { nowMs: T0 })).toBeUndefined();
  });
});

describe('#276 t6: knowledge materially affects canonical ranking', () => {
  const context = () =>
    ({
      runtimeId: 'r',
      correlationId: 'c',
      mode: 'simulation',
      policySnapshot: {
        id: 'p',
        schemaVersion: 1,
        createdAt: iso(),
        source: 'test',
        metadata: {},
        policy: {
          allowedActions: ['connectivity_failover', 'provider_switch'],
          deniedActions: [],
          capabilityRequirements: {},
          securityConstraints: [],
          actionBudget: 10,
          maxConcurrentActions: 5,
          confidenceThreshold: 0.1,
          telemetryFreshnessMs: 60_000,
          simulationOnly: false,
          failClosed: true,
        },
      },
      capabilitySnapshot: {
        id: 'cap',
        schemaVersion: 1,
        createdAt: iso(),
        source: 'test',
        metadata: {},
        capabilities: [],
        trusted: true,
      },
      deadline: iso(60_000),
      cancelled: false,
      securityContext: { trusted: true },
    }) as unknown as RuntimeContext;

  it('only overrides objectives knowledge actually measured', () => {
    const merged = mergeKnowledgeEvidence(neutralEvidence(), {
      evidence: { latency: 0.1 },
      weights: { latency: 1 },
      contributions: [],
      rejected: [],
      advisoryShare: 0,
    });
    expect(merged.latency).toBe(0.1);
    expect(merged.cost).toBe(0.5);
  });

  it('ignores knowledge carrying objectives outside the planner set', () => {
    const merged = mergeKnowledgeEvidence(neutralEvidence(), {
      evidence: { notAnObjective: 1 },
      weights: { notAnObjective: 1 },
      contributions: [],
      rejected: [],
      advisoryShare: 0,
    });
    expect(Object.keys(merged)).toHaveLength(13);
    expect((merged as Record<string, number>).notAnObjective).toBeUndefined();
  });

  it('flips the selected strategy when knowledge reverses the objectives', async () => {
    const a = candidate({ id: 'a', expectedBenefit: 0.9, risk: 0.1 });
    const b = candidate({ id: 'b', expectedBenefit: 0.2, risk: 0.9 });
    const planner = new DeterministicPlanner();
    const objectives = {
      reachability: 1, latency: 0, jitter: 0, packetLoss: 0, throughput: 0, stability: 0,
      privacy: 0, trust: 0, security: 0, cost: 0, resourceUsage: 0, diversity: 0, recoveryProbability: 0,
    };
    // Without knowledge, the high-benefit candidate wins on reachability.
    const without = await planner.planAgainstObjectives([a, b], context(), {
      objectives: { ...objectives, latency: 0.2 },
      evidenceFor: () => neutralEvidence(),
    });
    expect(without.plan.selectedAction.id).toBe('a');

    // Knowledge is path-scoped: evidence about the incumbent's path must not be
    // applied to the alternative, so the incumbent's latency penalty must be
    // supplied per candidate. Ranking must then flip.
    const evidenceFor = knowledgeEvidenceFunction({
      arbitrated: { evidence: {}, weights: {}, contributions: [], rejected: [], advisoryShare: 0 },
      baseEvidenceFor: defaultEvidenceFor,
      arbitratedFor: (c) => ({
        evidence: c.id === 'a' ? { latency: 0.05, reachability: 0.95 } : { latency: 0.95, reachability: 0.05 },
        weights: { latency: 1, reachability: 1 },
        contributions: [],
        rejected: [],
        advisoryShare: 0,
      }),
    });
    const with_ = await planner.planAgainstObjectives([a, b], context(), {
      objectives: { ...objectives, latency: 1, reachability: 0 },
      evidenceFor,
    });
    expect(with_.plan.selectedAction.id).toBe('b');
  });

  it('applies quarantine as a bounded score multiplier with explanation', () => {
    const failureMemory = new DecayingFailureMemory({
      halfLifeMs: 60_000,
      quarantineThreshold: 0.01,
      quarantinePenalty: 0.5,
    });
    failureMemory.recordFailure({ strategyId: 'cand-1' });
    const influence = knowledgeInfluenceFor({
      base: neutralEvidence(),
      arbitrated: { evidence: {}, weights: {}, contributions: [], rejected: [], advisoryShare: 0 },
      failureMemory,
      candidate: candidate({ metadata: { quarantineKey: 'cand-1' } }),
      nowMs: Date.now(),
    });
    expect(influence.scoreMultiplier).toBeLessThan(1);
    expect(influence.scoreMultiplier).toBeGreaterThanOrEqual(0);
    expect(influence.explanation).toContain('failureMemory');
  });

  it('leaves the multiplier at 1 with no failure memory', () => {
    const influence = knowledgeInfluenceFor({
      base: neutralEvidence(),
      arbitrated: { evidence: {}, weights: {}, contributions: [], rejected: [], advisoryShare: 0 },
      candidate: candidate(),
      nowMs: Date.now(),
    });
    expect(influence.scoreMultiplier).toBe(1);
    expect(influence.explanation).toBe('no knowledge evidence');
  });
});

describe('#276 t9: local decisions survive federation outage', () => {
  it('ranks with no federated knowledge at all', async () => {
    const store = new KnowledgeStore({ nowMs: () => T0 });
    store.record({
      kind: 'measurement',
      source: 'measurement',
      provenance: { producer: 'local', source: 'measurement', trustLevel: 'verified' },
      observedAt: iso(),
      confidence: 0.9,
      correlationId: 'c',
      objectiveEvidence: { latency: 0.2 },
    });
    const arbitrated = store.arbitrate({}, { nowMs: T0 });
    expect(arbitrated.evidence.latency).toBeCloseTo(0.2, 6);
    expect(arbitrated.rejected).toHaveLength(0);
  });

  it('produces an explainable result when every record is rejected', () => {
    const expiredRecord = record({
      observedAt: iso(-10_000),
      expiresAt: iso(-1_000),
      objectiveEvidence: { latency: 0.2 },
    });
    const store = new KnowledgeStore({ nowMs: () => T0 });
    store.record({
      kind: 'measurement',
      source: 'measurement',
      provenance: { producer: 'local', source: 'measurement' },
      observedAt: iso(-10_000),
      expiresAt: iso(-1_000),
      confidence: 0.9,
      correlationId: 'c',
      objectiveEvidence: { latency: 0.2 },
    });
    // Expired records never reach arbitration at all: the query layer drops them.
    expect(store.query({ nowMs: T0 })).toHaveLength(0);
    const arbitrated = store.arbitrate({}, { nowMs: T0 });
    expect(arbitrated.evidence).toEqual({});
    expect(arbitrated.rejected).toHaveLength(0);
    // Passed directly to arbitration, expiry is recorded as an explicit rejection.
    const direct = arbitrateKnowledge([expiredRecord], { nowMs: T0 });
    expect(direct.rejected[0]!.reason).toBe('expired');
    expect(knowledgeInfluenceFor({
      base: neutralEvidence(),
      arbitrated,
      candidate: candidate(),
      nowMs: T0,
    }).scoreMultiplier).toBe(1);
  });

  it('cannot become mutation authority: knowledge never sets rejectionReasons or capabilities', () => {
    const influence = knowledgeInfluenceFor({
      base: neutralEvidence(),
      arbitrated: {
        evidence: { latency: 1 },
        weights: { latency: 1 },
        contributions: [],
        rejected: [],
        advisoryShare: 1,
      },
      candidate: candidate(),
      nowMs: T0,
    });
    // The influence surface is objective evidence plus a multiplier only.
    expect(Object.keys(influence).sort()).toEqual([
      'advisoryShare',
      'explanation',
      'objectiveEvidence',
      'scoreMultiplier',
    ]);
  });
});
