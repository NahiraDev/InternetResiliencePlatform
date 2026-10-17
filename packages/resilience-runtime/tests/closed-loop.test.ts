import { describe, expect, it, vi } from 'vitest';
import type { DecisionRecord, CompiledIntent } from '../src/domain/types.js';
import { BoundedClosedLoopController } from '../src/closed-loop.js';

type Outcome = DecisionRecord['outcome'];

const record = (outcome: Outcome, index: number): DecisionRecord => ({
  id: `record-${index}`,
  schemaVersion: 1,
  createdAt: '2026-09-09T00:00:00.000Z',
  source: 'closed-loop-test',
  metadata: {},
  correlationId: `test/cycle-${index}`,
  decisionId: `decision-${index}`,
  runtimeStateBefore: 'planning',
  runtimeStateAfter:
    outcome === 'blocked' ? 'blocked' : outcome === 'failed' ? 'failed' : 'degraded',
  runtimeContext: {
    runtimeId: 'test-runtime',
    correlationId: `test/cycle-${index}`,
    mode: 'simulation',
    deadline: '2099-01-01T00:00:00.000Z',
    configuration: {
      enabled: true,
      mode: 'simulation',
      cycleIntervalMs: 0,
      maxActionsPerCycle: 1,
      maxConcurrentActions: 1,
      observationFreshnessMs: 1000,
      decisionTimeoutMs: 1000,
      verificationTimeoutMs: 1000,
      recoveryTimeoutMs: 1000,
      persistenceMode: 'memory',
      replayEnabled: false,
    },
  },
  observations: {
    id: `observations-${index}`,
    schemaVersion: 1,
    createdAt: '2026-09-09T00:00:00.000Z',
    source: 'closed-loop-test',
    metadata: {},
    observations: [],
    stale: false,
    minConfidence: 1,
  },
  incidents: [],
  policyEvaluation: { allowed: true, reasons: [], requiredCapabilities: [] },
  candidates: [],
  outcome,
  confidence: 1,
  durationMs: 1,
  explanation: [],
});

const runtime = (...outcomes: Outcome[]) => ({
  cycle: vi.fn(async ({ correlationId }: { correlationId?: string }) => {
    const index = Number(correlationId?.split('-').at(-1) ?? '1');
    return record(outcomes[index - 1] ?? outcomes.at(-1)!, index);
  }),
});

const baseIntent = (overrides: Partial<CompiledIntent> = {}): CompiledIntent =>
  ({
    intentId: 'intent-drift',
    version: 1,
    priority: 'normal',
    desiredOutcome: 'stable connectivity',
    target: {},
    constraints: {},
    objectives: { score: 0.95 },
    confidence: 0.9,
    provenance: 'test',
    autonomy: 'OBSERVE_ONLY',
    scope: {},
    effectiveFrom: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    compiledAt: new Date().toISOString(),
    ...overrides,
  }) as CompiledIntent;

describe('BoundedClosedLoopController', () => {
  it('stops at a healthy outcome by default', async () => {
    const fake = runtime('degraded', 'success', 'degraded');
    const controller = new BoundedClosedLoopController(fake);

    const result = await controller.run({ maxCycles: 3, correlationId: 'loop' });

    expect(result.status).toBe('healthy');
    expect(result.stopReason).toBe('healthy');
    expect(result.cyclesCompleted).toBe(2);
    expect(fake.cycle).toHaveBeenCalledTimes(2);
  });

  it('honors the hard cycle bound when healthy stopping is disabled', async () => {
    const fake = runtime('degraded');
    const controller = new BoundedClosedLoopController(fake);

    const result = await controller.run({
      maxCycles: 3,
      stopWhenHealthy: false,
      correlationId: 'loop',
    });

    expect(result.status).toBe('bounded');
    expect(result.stopReason).toBe('max_cycles');
    expect(result.cyclesCompleted).toBe(3);
    expect(fake.cycle).toHaveBeenCalledTimes(3);
  });

  it('merges top-level runtime context overrides into each cycle input', async () => {
    const fake = runtime('success');
    const controller = new BoundedClosedLoopController(fake);

    await controller.run({
      maxCycles: 1,
      mode: 'simulation',
      runtimeId: 'loop-runtime',
      securityContext: { trusted: true },
    });

    expect(fake.cycle).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'simulation',
        runtimeId: 'loop-runtime',
        securityContext: { trusted: true },
      }),
    );
  });

  it('stops on a blocked decision instead of continuing mutation attempts', async () => {
    const fake = runtime('blocked', 'success');
    const controller = new BoundedClosedLoopController(fake);

    const result = await controller.run({ maxCycles: 2, correlationId: 'loop' });

    expect(result.status).toBe('blocked');
    expect(result.stopReason).toBe('blocked');
    expect(result.cyclesCompleted).toBe(1);
    expect(fake.cycle).toHaveBeenCalledTimes(1);
  });

  it('honors an already-aborted signal without entering the runtime', async () => {
    const fake = runtime('success');
    const controller = new BoundedClosedLoopController(fake);
    const abort = new AbortController();
    abort.abort();

    const result = await controller.run({ maxCycles: 3, signal: abort.signal });

    expect(result.status).toBe('aborted');
    expect(result.stopReason).toBe('aborted');
    expect(result.cyclesCompleted).toBe(0);
    expect(fake.cycle).not.toHaveBeenCalled();
  });

  it('rejects unsafe loop configuration values', async () => {
    const fake = runtime('success');
    const controller = new BoundedClosedLoopController(fake);

    await expect(controller.run({ maxCycles: 0 })).rejects.toThrow('maxCycles');
    await expect(controller.run({ maxCycles: 11 })).rejects.toThrow('maxCycles');
    await expect(controller.run({ intervalMs: -1 })).rejects.toThrow('intervalMs');
  });

  it('attaches observe-only drift assessments when driftInputs are supplied and never mutates', async () => {
    const fake = runtime('success');
    const controller = new BoundedClosedLoopController(fake);
    const intent = baseIntent();

    const result = await controller.run({
      maxCycles: 1,
      correlationId: 'drift-loop',
      driftInputs: {
        intent,
        observed: { score: 0.5 },
      },
    });

    expect(result.status).toBe('healthy');
    expect(result.driftAssessments).toHaveLength(1);
    const assessment = result.driftAssessments![0]!;
    expect(assessment.intentId).toBe('intent-drift');
    expect(assessment.severity).toBe('high');
    expect(assessment.recommendedAdmission).toBe('OBSERVE_ONLY');
    expect(assessment.effective).toBe(true);
    // Detector and loop controller performed no mutation; runtime.cycle was still the only privileged call.
    expect(fake.cycle).toHaveBeenCalledTimes(1);
  });

  it('omits driftAssessments when no driftInputs are provided', async () => {
    const fake = runtime('success');
    const controller = new BoundedClosedLoopController(fake);

    const result = await controller.run({ maxCycles: 1 });

    expect(result.driftAssessments).toBeUndefined();
  });
});
