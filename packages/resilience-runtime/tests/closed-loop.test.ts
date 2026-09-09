import { describe, expect, it, vi } from 'vitest';
import type { DecisionRecord } from '../src/domain/types.js';
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
  runtimeStateAfter: outcome === 'blocked' ? 'blocked' : outcome === 'failed' ? 'failed' : 'degraded',
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

    const result = await controller.run({ maxCycles: 3, stopWhenHealthy: false, correlationId: 'loop' });

    expect(result.status).toBe('bounded');
    expect(result.stopReason).toBe('max_cycles');
    expect(result.cyclesCompleted).toBe(3);
    expect(fake.cycle).toHaveBeenCalledTimes(3);
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
});
