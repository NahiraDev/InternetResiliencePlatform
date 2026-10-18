import { describe, expect, it, vi } from 'vitest';
import { BoundedClosedLoopController } from '../src/closed-loop.js';
import { createCapabilitySnapshot } from '../src/context/context.js';
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
      mode: 'simulation',
      correlationId: 'phase-78/integration',
      idempotencyKey: 'phase-78/integration',
      context: {
        securityContext: { trusted: true },
        capabilitySnapshot: createCapabilitySnapshot([], true),
      },
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

  it('passes live execution through the safety kernel before the transaction boundary', async () => {
    const runtime = new ResilienceRuntime([], {
      runtimeId: 'phase-78-safety-integration',
      instanceId: 'phase-78-safety-test',
    });

    const result = await new BoundedClosedLoopController(runtime).run({
      maxCycles: 1,
      mode: 'live',
      correlationId: 'phase-78/safety',
      context: {
        securityContext: { trusted: true },
        capabilitySnapshot: createCapabilitySnapshot([], true),
        policySnapshot: {
          id: 'phase-78-policy',
          schemaVersion: 1,
          createdAt: new Date().toISOString(),
          source: 'phase-78-test',
          metadata: {},
          policy: {
            allowedActions: ['noop'],
            deniedActions: [],
            capabilityRequirements: {},
            securityConstraints: ['trusted-context'],
            actionBudget: 1,
            maxConcurrentActions: 1,
            confidenceThreshold: 0,
            telemetryFreshnessMs: 60_000,
            simulationOnly: false,
            failClosed: true,
          },
        },
      },
    });

    expect(result.records[0]?.outcome).toBe('simulated');
    const events = runtime.events.events.map(({ event }) => event);
    expect(events.indexOf('runtime.safety.assessed')).toBeGreaterThanOrEqual(0);
    expect(events.indexOf('runtime.safety.assessed')).toBeLessThan(
      events.indexOf('runtime.transaction.created'),
    );
  });

  it('observes intent drift without invoking privileged mutation or altering cycle outcomes', async () => {
    const runtime = new ResilienceRuntime([], {
      runtimeId: 'phase-85-drift-integration',
      instanceId: 'phase-85-test',
    });
    const cycle = vi.spyOn(runtime, 'cycle');
    const controller = new BoundedClosedLoopController(runtime);

    const intent = {
      intentId: 'intent-85',
      objectives: { latency: 50, reachability: 1 },
      lifecycleStatus: 'active',
      effectiveFrom: new Date(Date.now() - 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    } as any;

    const result = await controller.run({
      maxCycles: 1,
      mode: 'simulation',
      correlationId: 'phase-85/drift',
      idempotencyKey: 'phase-85/drift',
      context: {
        securityContext: { trusted: true },
        capabilitySnapshot: createCapabilitySnapshot([], true),
      },
      driftInputs: {
        intent,
        observed: { latency: 120, reachability: 1 },
      },
    });

    expect(cycle).toHaveBeenCalledTimes(1);
    expect(result.cyclesCompleted).toBe(1);
    expect(result.driftAssessments).toBeDefined();
    expect(result.driftAssessments).toHaveLength(1);
    const drift = result.driftAssessments![0];
    expect(drift.effective).toBe(true);
    expect(drift.severity).not.toBe('none');
    expect(drift.recommendedAdmission).toBe('OBSERVE_ONLY');
    expect(drift.reasons.some((r) => r.includes('latency'))).toBe(true);
    // Drift must not change the cycle outcome or introduce a parallel mutation path.
    expect(result.records[0]?.outcome).toBe('simulated');
    expect(result.status).toBe('healthy');
  });
});
