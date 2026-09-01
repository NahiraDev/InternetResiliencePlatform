import { describe, expect, it, vi } from 'vitest';
import { DecisionEvaluator } from './DecisionEvaluator.js';
import {
  NetworkDecisionEngine,
  type DecisionCandidate,
  type NetworkDecisionContext,
} from './NetworkDecisionEngine.js';

const now = '2026-08-13T00:00:00.000Z';
const versions = {
  policyVersion: 'p1',
  networkStateVersion: 'n1',
  securityStateVersion: 's1',
  routingStateVersion: 'r1',
  tunnelStateVersion: 't1',
  dnsStateVersion: 'd1',
};
const candidate = (id: string, patch: Partial<DecisionCandidate> = {}): DecisionCandidate => ({
  id,
  type: 'tunnel',
  capabilities: ['tunnel', 'encrypted'],
  health: 'healthy',
  timestamp: now,
  policyCompatibility: true,
  securityCompatibility: true,
  metrics: {
    latencyMs: 25,
    packetLossRatio: 0,
    jitterMs: 4,
    throughputMbps: 100,
    availabilityRatio: 0.99,
    reliabilityRatio: 0.98,
    recoveryCost: 10,
    tunnelHealth: 1,
  },
  ...patch,
});
const context = (candidates: DecisionCandidate[]): NetworkDecisionContext => ({
  timestamp: now,
  versions,
  requiredCapabilities: ['tunnel'],
  candidates,
  historicalObservations: Object.fromEntries(
    candidates.map((c) => [
      c.id,
      Array.from({ length: 5 }, (_, i) => ({
        timestamp: `2026-08-12T00:0${i}:00.000Z`,
        latencyMs: c.metrics.latencyMs ?? 30,
        availabilityRatio: 0.98,
        reliabilityRatio: 0.98,
        uptimeRatio: 0.99,
      })),
    ]),
  ),
});

describe('Phase 19 NetworkDecisionEngine', () => {
  it('ranks healthy candidates with bounded deterministic scores and explanations', async () => {
    const engine = new NetworkDecisionEngine();
    const result = await engine.evaluate({
      type: 'tunnelDecision',
      context: context([
        candidate('a'),
        candidate('b', { metrics: { ...candidate('b').metrics, latencyMs: 250 } }),
      ]),
      now,
    });
    expect(result.selectedCandidate?.id).toBe('a');
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.explanation).toContain('select a');
  });
  it('rejects hard policy/security/capability/unavailable constraints before scoring', async () => {
    const engine = new NetworkDecisionEngine();
    const result = await engine.evaluate({
      type: 'routeDecision',
      context: context([
        candidate('policy', { policyCompatibility: false }),
        candidate('security', { securityCompatibility: false }),
        candidate('missing', { capabilities: [] }),
        candidate('ok'),
      ]),
      now,
    });
    expect(result.selectedCandidate?.id).toBe('ok');
    expect(result.rejectedCandidates.map((r) => r.id)).toEqual(
      expect.arrayContaining(['policy', 'security', 'missing']),
    );
  });
  it('downgrades confidence for missing and stale telemetry and expires decisions', async () => {
    const engine = new NetworkDecisionEngine({ ttlMs: 1000 });
    const stale = candidate('stale', { timestamp: '2026-08-12T00:00:00.000Z', metrics: {} });
    const result = await engine.evaluate({
      type: 'dnsDecision',
      context: { ...context([stale]), requiredCapabilities: [] },
      now,
    });
    expect(result.status).toBe('rejected');
    expect(engine.isExpired(result, '2026-08-13T00:00:02.000Z')).toBe(true);
  });
  it('detects anomalies without executing network changes', async () => {
    const events: string[] = [];
    const engine = new NetworkDecisionEngine({
      events: {
        emit: (e) => {
          events.push(e);
        },
      },
    });
    const bad = candidate('spike', { metrics: { ...candidate('spike').metrics, latencyMs: 300 } });
    await engine.evaluate({
      type: 'tunnelDecision',
      context: {
        ...context([bad]),
        historicalObservations: {
          spike: [20, 22, 21, 23, 20].map((latencyMs, i) => ({
            timestamp: `t${i}`,
            latencyMs,
            uptimeRatio: 1,
          })),
        },
      },
      now,
    });
    expect(events).toContain('anomaly.detected');
  });
  it('uses deterministic fallback on model timeout, failure, and validates invalid model output', async () => {
    const engine = new NetworkDecisionEngine({ model: { timeoutMs: 5 } });
    const slow = {
      id: 'slow-model',
      version: '1',
      capabilities: [],
      evaluate: () =>
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('late')), 20)),
    };
    const result = await engine.evaluate({
      type: 'connectivityDecision',
      context: context([candidate('ok', { type: 'connectivity-source' })]),
      modelProvider: slow,
      now,
    });
    expect(result.fallbackUsed).toBe(true);
    expect(
      engine.validateModelOutput({ selectedCandidate: candidate('ghost'), confidence: 2 }, ['ok'])
        .allowed,
    ).toBe(false);
  });
  it('evaluates intervention outcomes with correct accuracy, FP, FN, and ranking metrics', () => {
    const evaluator = new DecisionEvaluator();
    const makeDecision = (
      candidateId: string,
      recommendedAction: 'remain' | 'switch-route',
      confidence = 0.9,
    ) =>
      ({
        decisionId: `d-${candidateId}`,
        selectedCandidate: candidate(candidateId),
        recommendedAction,
        confidence,
      }) as never;

    const metrics = evaluator.evaluate(
      [
        makeDecision('failed-intervention', 'switch-route'),
        makeDecision('healthy-remain', 'remain'),
        makeDecision('healthy-intervention', 'switch-route'),
        makeDecision('failed-remain', 'remain'),
      ],
      [
        { candidateId: 'failed-intervention', healthy: false, failed: true, rank: 1 },
        { candidateId: 'healthy-remain', healthy: true, failed: false, rank: 2 },
        { candidateId: 'healthy-intervention', healthy: true, failed: false, rank: 3 },
        { candidateId: 'failed-remain', healthy: false, failed: true, rank: 4 },
      ],
    );

    expect(metrics.recommendationAccuracy).toBe(0.5);
    expect(metrics.falsePositiveRate).toBe(0.25);
    expect(metrics.falseNegativeRate).toBe(0.25);
    expect(metrics.rankingQuality).toBeCloseTo((1 + 0.5 + 1 / 3 + 0.25) / 4);
    expect(metrics.confidenceCalibration).toBeCloseTo(0.5);
  });
  it('supports replay, state-version revalidation, manual override, evaluator, privacy filtering, concurrency and resource limits', async () => {
    const audit = vi.fn();
    const engine = new NetworkDecisionEngine({
      maxConcurrentEvaluations: 1,
      audit: { record: audit },
    });
    const c = context([
      candidate('a'),
      candidate('b', { metrics: { ...candidate('b').metrics, latencyMs: 20 } }),
    ]);
    const result = await engine.replay(c, 'tunnelDecision', now);
    expect(result.candidates[0]?.candidate.id).toBe('b');
    expect(
      engine.revalidate(result, { ...c, versions: { ...versions, tunnelStateVersion: 't2' } }, now),
    ).toBe('stale');
    const override = await engine.evaluate({
      type: 'tunnelDecision',
      context: c,
      now,
      manualOverride: {
        candidateId: 'a',
        reason: 'operator test',
        requestedBy: 'tester',
        expiresAt: '2026-08-14T00:00:00.000Z',
      },
    });
    expect(override.selectedCandidate?.id).toBe('a');
    expect(
      new DecisionEvaluator().evaluate(
        [override],
        [{ candidateId: 'a', healthy: true, failed: false, rank: 1 }],
      ).recommendationAccuracy,
    ).toBe(0);
    expect(
      JSON.stringify(engine.privacyFilter({ token: 'abc', nested: { privateKey: 'k' } })),
    ).not.toContain('abc');
  });
  it('applies external policy and security gates after ranking', async () => {
    const engine = new NetworkDecisionEngine({
      policyValidator: { validate: () => ({ allowed: true }) },
      securityValidator: {
        validate: (c) => ({ allowed: c.id !== 'a', reason: 'blocked by phase18' }),
      },
    });
    const result = await engine.evaluate({
      type: 'tunnelDecision',
      context: context([candidate('a')]),
      now,
    });
    expect(result.status).toBe('rejected');
    expect(result.rejectionReason).toBe('blocked by phase18');
  });
});
