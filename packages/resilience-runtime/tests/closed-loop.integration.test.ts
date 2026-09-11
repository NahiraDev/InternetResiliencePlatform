import { describe, expect, it, vi } from 'vitest';
import { BoundedClosedLoopController } from '../src/closed-loop.js';
import { ResilienceRuntime } from '../src/runtime.js';

describe('BoundedClosedLoopController integration', () => {
  it('drives the canonical ResilienceRuntime cycle without a parallel control path', async () => {
    const runtime = new ResilienceRuntime([], {
      runtimeId: 'phase-78-integration',
      instanceId: 'phase-78-test',
    });
    const cycle = vi.spyOn(runtime, 'cycle');
    const controller = new BoundedClosedLoopController(runtime);

    const result = await controller.run({
      maxCycles: 2,
      stopWhenHealthy: false,
      context: { mode: 'simulation' },
      correlationId: 'phase-78/integration',
      idempotencyKey: 'phase-78/integration',
    });

    expect(cycle).toHaveBeenCalledTimes(2);
    expect(result.cyclesCompleted).toBe(2);
    expect(result.stopReason).toBe('max_cycles');
    expect(result.records).toHaveLength(2);
    expect(result.records.every((record) => record.outcome === 'simulated')).toBe(true);

    expect(cycle.mock.calls.map(([input]) => input.correlationId)).toEqual([
      'phase-78/integration/cycle-1',
      'phase-78/integration/cycle-2',
    ]);
    expect(cycle.mock.calls.map(([input]) => input.idempotencyKey)).toEqual([
      'phase-78/integration/cycle-1',
      'phase-78/integration/cycle-2',
    ]);
    expect(result.records.map((record) => record.runtimeContext.correlationId)).toEqual([
      'phase-78/integration/cycle-1',
      'phase-78/integration/cycle-2',
    ]);

    const snapshot = await runtime.getRuntimeSnapshot();
    expect(snapshot.counters.cyclesTotal).toBe(2);
    expect(snapshot.counters.decisionsTotal).toBe(2);
  });
});
