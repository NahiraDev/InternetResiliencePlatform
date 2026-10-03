import { describe, expect, it } from 'vitest';
import type { CandidateAction, CompiledIntent, RuntimeContext } from '../src/domain/types.js';
import { DeterministicPlanner } from '../src/planning/planner.js';
import {
  STRATEGY_OBJECTIVES,
  emptyObjectives,
  objectivesFromIntent,
  rankByObjectives,
  scoreCandidate,
  uniformObjectives,
} from '../src/planning/objectives.js';
import {
  DecisionEpoch,
  ResourceReservationTable,
  buildStructuredPlan,
} from '../src/planning/reservation.js';
import { generateStrategies } from '../src/planning/strategy-generator.js';

const context = (): RuntimeContext =>
  ({
    runtimeId: 'runtime',
    correlationId: 'corr-277',
    mode: 'simulation',
    policySnapshot: {
      id: 'policy-277',
      schemaVersion: 1,
      createdAt: '2026-10-03T00:00:00.000Z',
      source: 'test',
      metadata: {},
      policy: {
        allowedActions: ['connectivity_failover', 'provider_switch', 'degraded_mode', 'health_reprobe'],
        deniedActions: [],
        capabilityRequirements: {},
        securityConstraints: [],
        actionBudget: 10,
        maxConcurrentActions: 5,
        confidenceThreshold: 0.5,
        telemetryFreshnessMs: 60_000,
        simulationOnly: false,
        failClosed: true,
      },
    },
    capabilitySnapshot: {
      id: 'cap-277',
      schemaVersion: 1,
      createdAt: '2026-10-03T00:00:00.000Z',
      source: 'test',
      metadata: {},
      capabilities: ['dns.switch', 'privileged.mutation'],
      trusted: true,
    },
    deadline: '2026-10-03T00:01:00.000Z',
    cancelled: false,
    securityContext: { trusted: true },
  }) as unknown as RuntimeContext;

const compiledIntent = (objectives: Record<string, number>): CompiledIntent =>
  ({
    intentId: 'intent-277',
    version: 1,
    priority: 'high',
    desiredOutcome: 'restore-reachability',
    target: { host: 'example.test' },
    constraints: {},
    objectives,
    confidence: 0.9,
    provenance: 'test',
    autonomy: 'SAFE_AUTOMATION',
    scope: {},
    compiledAt: '2026-10-03T00:00:00.000Z',
  }) as CompiledIntent;

const candidate = (over: Partial<CandidateAction> = {}): CandidateAction =>
  ({
    id: `cand-${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: 1,
    createdAt: '2026-10-03T00:00:00.000Z',
    correlationId: 'corr-277',
    source: 'resilience-runtime',
    metadata: {},
    intent: 'connectivity_failover',
    expectedBenefit: 0.8,
    risk: 0.2,
    confidence: 0.9,
    requiredCapabilities: [],
    dependencies: [],
    postconditions: ['reachable'],
    verificationRequirements: ['probe-succeeds'],
    rejectionReasons: [],
    ...over,
  }) as CandidateAction;

describe('#277 objective-driven optimization', () => {
  it('exposes every Section F objective', () => {
    expect(STRATEGY_OBJECTIVES).toContain('reachability');
    expect(STRATEGY_OBJECTIVES).toContain('recoveryProbability');
    expect(STRATEGY_OBJECTIVES).toContain('diversity');
    expect(STRATEGY_OBJECTIVES.length).toBe(13);
  });

  it('normalises intent objectives and keeps unexpressed ones non-zero', () => {
    const objectives = objectivesFromIntent(compiledIntent({ latency: 1 }));
    expect(objectives.latency).toBeGreaterThan(objectives.cost);
    for (const objective of STRATEGY_OBJECTIVES) {
      expect(objectives[objective]).toBeGreaterThan(0);
      expect(objectives[objective]).toBeLessThanOrEqual(1);
    }
  });

  it('always produces weights that sum to 1', () => {
    for (const expressed of [
      { latency: 1 },
      { latency: 0.5, cost: 0.25 },
      { reachability: 1, latency: 1, jitter: 1, packetLoss: 1, throughput: 1, stability: 1, privacy: 1, trust: 1, security: 1, cost: 1, resourceUsage: 1, diversity: 1, recoveryProbability: 1 },
    ]) {
      const objectives = objectivesFromIntent(compiledIntent(expressed));
      const total = STRATEGY_OBJECTIVES.reduce((sum, o) => sum + objectives[o], 0);
      expect(total).toBeCloseTo(1, 10);
    }
  });

  it('does not let a fully-expressed intent zero out other objectives', () => {
    const objectives = objectivesFromIntent(compiledIntent({ latency: 1 }));
    expect(objectives.latency).toBeGreaterThan(objectives.reachability);
    for (const objective of STRATEGY_OBJECTIVES) {
      expect(objectives[objective]).toBeGreaterThan(0);
    }
  });

  it('ignores objectives it cannot map and non-finite weights', () => {
    const objectives = objectivesFromIntent(
      compiledIntent({ latency: 1, bogusObjective: 5, jitter: Number.NaN }),
    );
    expect(objectives.latency).toBeGreaterThan(0);
    for (const objective of STRATEGY_OBJECTIVES) {
      expect(Number.isFinite(objectives[objective])).toBe(true);
    }
  });

  it('falls back when all expressed weights are zero', () => {
    const objectives = objectivesFromIntent(compiledIntent({ latency: 0 }));
    expect(objectives.latency).toBeCloseTo(uniformObjectives().latency, 10);
  });

  it('supports emptyObjectives for an explicitly empty vector', () => {
    expect(Object.values(emptyObjectives()).every((v) => v === 0)).toBe(true);
  });

  it('falls back to uniform weighting when the intent expresses nothing', () => {
    const objectives = objectivesFromIntent(compiledIntent({}));
    for (const objective of STRATEGY_OBJECTIVES) {
      expect(objectives[objective]).toBeCloseTo(uniformObjectives()[objective], 10);
    }
  });

  it('does not invent favourable privacy/security/diversity evidence', () => {
    const scored = scoreCandidate(candidate({ confidence: 1 }), uniformObjectives());
    expect(scored.contributions.privacy).toBeGreaterThan(0);
    expect(scored.contributions.privacy).toBeLessThan(scored.contributions.reachability);
  });

  it('ranks differently under different intent objectives', () => {
    const fast = candidate({ id: 'fast', risk: 0.05, expectedBenefit: 0.3 });
    const strong = candidate({ id: 'strong', risk: 0.6, expectedBenefit: 1 });
    const latencyFirst = rankByObjectives(
      [strong, fast],
      objectivesFromIntent(compiledIntent({ latency: 1 })),
    );
    const benefitFirst = rankByObjectives(
      [strong, fast],
      objectivesFromIntent(compiledIntent({ reachability: 1 })),
    );
    expect(latencyFirst[0]?.candidate.id).toBe('fast');
    expect(benefitFirst[0]?.candidate.id).toBe('strong');
  });

  it('is deterministic for equal candidates', () => {
    const a = candidate({ id: 'a' });
    const b = candidate({ id: 'b' });
    const objectives = uniformObjectives();
    expect(rankByObjectives([a, b], objectives).map((s) => s.candidate.id)).toEqual(
      rankByObjectives([b, a], objectives).map((s) => s.candidate.id),
    );
  });

  it('produces a plan with optimization evidence via planAgainstObjectives', async () => {
    const planner = new DeterministicPlanner();
    const result = await planner.planAgainstObjectives(
      [candidate({ id: 'x' })],
      context(),
      { intent: compiledIntent({ latency: 1 }) },
    );
    expect(result.scored).toHaveLength(1);
    const optimization = result.plan.metadata.optimization as {
      objectiveScore: number;
      objectives: Record<string, number>;
    };
    expect(optimization.objectiveScore).toBeGreaterThan(0);
    expect(Object.keys(optimization.objectives)).toHaveLength(13);
  });

  it('keeps legacy plan() behaviour intact', async () => {
    const plan = await new DeterministicPlanner().plan([candidate()], context());
    expect(plan.selectedAction.intent).toBe('connectivity_failover');
  });
});

describe('#277 multi-candidate strategy generation', () => {
  it('generates a primary, fallback, conservative and alternate strategy', () => {
    const strategies = generateStrategies({
      context: context(),
      intent: compiledIntent({ latency: 1 }),
      seed: {
        intent: 'connectivity_failover',
        expectedBenefit: 0.8,
        risk: 0.4,
        confidence: 0.9,
        requiredCapabilities: ['dns.switch'],
      },
    });
    expect(strategies.map((s) => s.kind)).toEqual([
      'primary',
      'fallback',
      'conservative',
      'alternate',
    ]);
    for (const strategy of strategies) {
      expect(strategy.candidate.rejectionReasons).toHaveLength(0);
      expect(strategy.candidate.metadata.intentId).toBe('intent-277');
    }
  });

  it('derives risk and benefit monotonically down the ladder', () => {
    const strategies = generateStrategies({
      context: context(),
      seed: { intent: 'connectivity_failover', expectedBenefit: 0.8, risk: 0.8, confidence: 0.9 },
    });
    expect(strategies[0]!.candidate.risk).toBeGreaterThan(strategies[3]!.candidate.risk);
    expect(strategies[0]!.candidate.expectedBenefit).toBeGreaterThan(
      strategies[2]!.candidate.expectedBenefit,
    );
  });

  it('clamps scaled values into range', () => {
    const strategies = generateStrategies({
      context: context(),
      seed: { intent: 'connectivity_failover', expectedBenefit: 1, risk: 1, confidence: 1 },
    });
    for (const strategy of strategies) {
      expect(strategy.candidate.risk).toBeLessThanOrEqual(1);
      expect(strategy.candidate.expectedBenefit).toBeLessThanOrEqual(1);
      expect(strategy.candidate.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('never filters by policy upstream', () => {
    const strategies = generateStrategies({
      context: context(),
      seed: {
        intent: 'connectivity_failover',
        expectedBenefit: 0.5,
        risk: 0.9,
        confidence: 0.1,
        requiredCapabilities: ['privileged.mutation'],
      },
    });
    expect(strategies).toHaveLength(4);
  });
});

describe('#277 resource reservation and concurrency control', () => {
  it('grants a reservation for the current epoch', () => {
    const epoch = new DecisionEpoch();
    const table = new ResourceReservationTable(epoch);
    const decision = table.reserve({ resourceId: 'gw-1', epoch: epoch.current(), ttlMs: 1000 });
    expect(decision.granted).toBe(true);
    expect(decision.reservation?.resourceId).toBe('gw-1');
  });

  it('rejects a second reservation for the same resource', () => {
    const epoch = new DecisionEpoch();
    const table = new ResourceReservationTable(epoch);
    table.reserve({ resourceId: 'gw-1', epoch: epoch.current(), ttlMs: 1000 });
    const second = table.reserve({ resourceId: 'gw-1', epoch: epoch.current(), ttlMs: 1000 });
    expect(second).toEqual({ granted: false, reason: 'already-reserved' });
  });

  it('allows the resource again after release', () => {
    const epoch = new DecisionEpoch();
    const table = new ResourceReservationTable(epoch);
    const first = table.reserve({ resourceId: 'gw-1', epoch: epoch.current(), ttlMs: 1000 });
    table.release(first.reservation!.reservationId);
    expect(table.reserve({ resourceId: 'gw-1', epoch: epoch.current(), ttlMs: 1000 }).granted).toBe(
      true,
    );
  });

  it('frees an expired reservation', () => {
    const epoch = new DecisionEpoch();
    const table = new ResourceReservationTable(epoch);
    table.reserve({ resourceId: 'gw-1', epoch: epoch.current(), ttlMs: 10, now: 1000 });
    expect(table.reserve({ resourceId: 'gw-1', epoch: epoch.current(), ttlMs: 10, now: 2000 }).granted).toBe(
      true,
    );
  });

  it('rejects a non-positive ttl', () => {
    const epoch = new DecisionEpoch();
    const table = new ResourceReservationTable(epoch);
    expect(() =>
      table.reserve({ resourceId: 'gw-1', epoch: epoch.current(), ttlMs: 0 }),
    ).toThrow(RangeError);
  });

  it('rejects an invalid configured capacity', () => {
    expect(() => new ResourceReservationTable(new DecisionEpoch(), { 'gw-1': 0 })).toThrow(RangeError);
  });

  it('reports reserved resources', () => {
    const epoch = new DecisionEpoch();
    const table = new ResourceReservationTable(epoch);
    table.reserve({ resourceId: 'gw-1', epoch: epoch.current(), ttlMs: 1000, now: 500 });
    expect(table.reservedResourceIds(500)).toEqual(['gw-1']);
    expect(table.reservedResourceIds(2000)).toEqual([]);
  });
});

describe('#277 stale-decision protection', () => {
  it('rejects a reservation from a superseded epoch', () => {
    const epoch = new DecisionEpoch();
    const table = new ResourceReservationTable(epoch);
    const stale = epoch.current();
    epoch.advance();
    expect(table.reserve({ resourceId: 'gw-1', epoch: stale, ttlMs: 1000 }).reason).toBe(
      'epoch-too-old',
    );
  });

  it('rejects a reservation whose resource version moved', () => {
    const epoch = new DecisionEpoch();
    const table = new ResourceReservationTable(epoch);
    table.observeResourceVersion('gw-1', 'v2');
    const decision = table.reserve({
      resourceId: 'gw-1',
      epoch: epoch.current(),
      resourceVersion: 'v1',
      ttlMs: 1000,
    });
    expect(decision.reason).toBe('resource-version-mismatch');
  });

  it('accepts a reservation matching the current resource version', () => {
    const epoch = new DecisionEpoch();
    const table = new ResourceReservationTable(epoch);
    table.observeResourceVersion('gw-1', 'v2');
    expect(
      table.reserve({
        resourceId: 'gw-1',
        epoch: epoch.current(),
        resourceVersion: 'v2',
        ttlMs: 1000,
      }).granted,
    ).toBe(true);
  });

  it('invalidates an in-flight decision when the epoch advances', () => {
    const epoch = new DecisionEpoch();
    const table = new ResourceReservationTable(epoch);
    const granted = table.reserve({ resourceId: 'gw-1', epoch: epoch.current(), ttlMs: 5000 });
    epoch.advance();
    expect(
      table.validateForExecution(granted.reservation!.reservationId, {
        epoch: epoch.current(),
        resourceId: 'gw-1',
      }),
    ).toEqual({ stale: true, reason: 'epoch-superseded' });
  });

  it('invalidates an in-flight decision when the resource version moves', () => {
    const epoch = new DecisionEpoch();
    const table = new ResourceReservationTable(epoch);
    table.observeResourceVersion('gw-1', 'v1');
    const granted = table.reserve({
      resourceId: 'gw-1',
      epoch: epoch.current(),
      resourceVersion: 'v1',
      ttlMs: 5000,
    });
    table.observeResourceVersion('gw-1', 'v2');
    expect(
      table.validateForExecution(granted.reservation!.reservationId, {
        epoch: epoch.current(),
        resourceId: 'gw-1',
      }),
    ).toEqual({ stale: true, reason: 'resource-version-changed' });
  });

  it('invalidates an in-flight decision after the ttl expires', () => {
    const epoch = new DecisionEpoch();
    const table = new ResourceReservationTable(epoch);
    const granted = table.reserve({ resourceId: 'gw-1', epoch: epoch.current(), ttlMs: 10, now: 1000 });
    expect(
      table.validateForExecution(granted.reservation!.reservationId, {
        epoch: epoch.current(),
        resourceId: 'gw-1',
        now: 5000,
      }),
    ).toEqual({ stale: true, reason: 'ttl-expired' });
  });

  it('allows execution for a fresh, current decision', () => {
    const epoch = new DecisionEpoch();
    const table = new ResourceReservationTable(epoch);
    table.observeResourceVersion('gw-1', 'v1');
    const granted = table.reserve({
      resourceId: 'gw-1',
      epoch: epoch.current(),
      resourceVersion: 'v1',
      ttlMs: 5000,
      now: 1000,
    });
    expect(
      table.validateForExecution(granted.reservation!.reservationId, {
        epoch: epoch.current(),
        resourceId: 'gw-1',
        now: 2000,
      }),
    ).toEqual({ stale: false });
  });

  it('rejects a reservation issued for a different resource', () => {
    const epoch = new DecisionEpoch();
    const table = new ResourceReservationTable(epoch);
    const granted = table.reserve({ resourceId: 'gw-1', epoch: epoch.current(), ttlMs: 5000 });
    expect(
      table.validateForExecution(granted.reservation!.reservationId, {
        epoch: epoch.current(),
        resourceId: 'gw-2',
      }),
    ).toEqual({ stale: true, reason: 'resource-version-changed' });
  });

  it('snapshots epoch, reservations and versions', () => {
    const epoch = new DecisionEpoch();
    const table = new ResourceReservationTable(epoch);
    table.observeResourceVersion('gw-1', 'v1');
    table.reserve({ resourceId: 'gw-1', epoch: epoch.current(), resourceVersion: 'v1', ttlMs: 5000 });
    const snapshot = table.snapshot();
    expect(snapshot.epoch).toBe(1);
    expect(snapshot.reservations).toHaveLength(1);
    expect(snapshot.versions).toEqual({ 'gw-1': 'v1' });
  });

  it('releases all reservations', () => {
    const epoch = new DecisionEpoch();
    const table = new ResourceReservationTable(epoch);
    table.reserve({ resourceId: 'gw-1', epoch: epoch.current(), ttlMs: 5000 });
    table.releaseAll();
    expect(table.reservedResourceIds()).toEqual([]);
  });
});

describe('#277 structured plan', () => {
  const selected = candidate({ id: 'primary', rollbackStrategy: 'restore-previous-route' });
  const alternative = candidate({ id: 'alt' });

  it('orders the selected action first then alternatives', () => {
    const plan = buildStructuredPlan({
      planId: 'plan-1',
      epoch: 3,
      selected,
      alternatives: [alternative],
      objectiveScore: 0.7,
      objectiveContributions: { latency: 0.4 },
    });
    expect(plan.steps.map((s) => s.order)).toEqual([1, 2]);
    expect(plan.steps[0]!.intent).toBe('connectivity_failover');
    expect(plan.steps[1]!.intent).toBe('connectivity_failover');
  });

  it('carries preconditions, safety boundaries, timeout, verification and rollback', () => {
    const plan = buildStructuredPlan({
      planId: 'plan-1',
      epoch: 3,
      selected,
      alternatives: [],
      objectiveScore: 0.7,
      objectiveContributions: {},
    });
    expect(plan.preconditions.length).toBeGreaterThan(0);
    expect(plan.safetyBoundaries).toContain('no-mutation-without-policy');
    expect(plan.timeoutMs).toBe(30_000);
    expect(plan.verificationRequirements).toEqual(['probe-succeeds']);
    expect(plan.rollbackStrategy).toBe('restore-previous-route');
  });

  it('honours explicit safety boundaries and timeout', () => {
    const plan = buildStructuredPlan({
      planId: 'plan-1',
      epoch: 3,
      selected,
      alternatives: [],
      safetyBoundaries: ['only-observe'],
      timeoutMs: 1000,
      objectiveScore: 0,
      objectiveContributions: {},
    });
    expect(plan.safetyBoundaries).toEqual(['only-observe']);
    expect(plan.timeoutMs).toBe(1000);
  });

  it('omits rollback when the candidate has none', () => {
    const plan = buildStructuredPlan({
      planId: 'plan-1',
      epoch: 1,
      selected: candidate({ rollbackStrategy: undefined }),
      alternatives: [],
      objectiveScore: 0,
      objectiveContributions: {},
    });
    expect(plan.rollbackStrategy).toBeUndefined();
  });

  it('records the epoch the plan was computed against', () => {
    const plan = buildStructuredPlan({
      planId: 'plan-1',
      epoch: 7,
      selected,
      alternatives: [],
      objectiveScore: 0,
      objectiveContributions: {},
    });
    expect(plan.epoch).toBe(7);
  });
});
