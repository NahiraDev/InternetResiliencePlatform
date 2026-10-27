import { describe, expect, it } from 'vitest';
import {
  checkPerformanceBudgets,
  DEFAULT_PERFORMANCE_BUDGETS,
  isWithinBudgets,
  withOperationTimeout,
  OperationTimeoutError,
  ObservationDedupCache,
  nextPollInterval,
  NetworkEventStormGuard,
  evaluateSelfHealth,
  classifyFailure,
  evaluateDegradation,
  degradationFaults,
} from '../src/index.js';

describe('Issue #283: Performance, Backpressure & Platform Self-Resilience', () => {
  it('defines measurable budgets and flags violations', () => {
    expect(DEFAULT_PERFORMANCE_BUDGETS.maxQueueDepth).toBe(1_000);
    expect(DEFAULT_PERFORMANCE_BUDGETS.maxEventsPerSecond).toBe(500);

    expect(isWithinBudgets({ cycleLatencyMs: 100, queueDepth: 10, eventsPerSecond: 50 })).toBe(
      true,
    );

    const violations = checkPerformanceBudgets({
      cycleLatencyMs: 5_000,
      queueDepth: 2_000,
      eventsPerSecond: 50,
    });
    expect(violations.map((v) => v.budget)).toContain('maxCycleLatencyMs');
    expect(violations.map((v) => v.budget)).toContain('maxQueueDepth');
    expect(violations.map((v) => v.budget)).not.toContain('maxEventsPerSecond');
  });

  it('times out long-running operations and honors cancellation', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 50));
    await expect(withOperationTimeout('probe', slow, 5)).rejects.toBeInstanceOf(
      OperationTimeoutError,
    );

    const fast = Promise.resolve('quick');
    await expect(withOperationTimeout('probe', fast, 1_000)).resolves.toBe('quick');

    const controller = new AbortController();
    controller.abort(new Error('caller cancelled'));
    await expect(
      withOperationTimeout('probe', Promise.resolve('x'), 1_000, controller.signal),
    ).rejects.toThrow('caller cancelled');
  });

  it('deduplicates observations and adapts polling within bounds', () => {
    const cache = new ObservationDedupCache(1_000, 10);
    expect(cache.admit('dns:example.test', 0).admitted).toBe(true);
    expect(cache.admit('dns:example.test', 500).duplicate).toBe(true);
    expect(cache.admit('dns:example.test', 2_000).admitted).toBe(true);

    const config = {
      baseIntervalMs: 1_000,
      minIntervalMs: 250,
      maxIntervalMs: 8_000,
      backoffFactor: 2,
      recoveryFactor: 2,
    };
    expect(nextPollInterval(1_000, false, config)).toBe(2_000);
    expect(nextPollInterval(1_000, true, config)).toBe(500);
    expect(nextPollInterval(8_000, false, config)).toBe(8_000);
    expect(nextPollInterval(250, true, config)).toBe(250);
  });

  it('sheds network-event storms instead of exhausting the daemon', () => {
    const guard = new NetworkEventStormGuard(3, 1_000, 5_000);
    expect(guard.admit(0).admitted).toBe(true);
    expect(guard.admit(10).admitted).toBe(true);
    expect(guard.admit(20).admitted).toBe(true);

    const shed = guard.admit(30);
    expect(shed.admitted).toBe(false);
    expect(shed.shed).toBe(true);

    // Cooldown sheds even a later event inside the window.
    expect(guard.admit(31).coolingDown).toBe(true);
    expect(guard.status().shedTotal).toBeGreaterThanOrEqual(2);
  });

  it('reports self-health independently of network state', () => {
    const healthy = evaluateSelfHealth({
      schedulerActive: 0,
      schedulerFailedTotal: 0,
      schedulerOverlapPreventedTotal: 0,
      queueDepth: 5,
      queueRejectedTotal: 0,
      telemetryFailuresTotal: 0,
      performance: { cycleLatencyMs: 100, queueDepth: 5 },
    });
    expect(healthy.level).toBe('healthy');

    const degraded = evaluateSelfHealth({
      schedulerActive: 0,
      schedulerFailedTotal: 2,
      schedulerOverlapPreventedTotal: 0,
      queueDepth: 5,
      queueRejectedTotal: 0,
      telemetryFailuresTotal: 0,
      performance: { cycleLatencyMs: 100 },
    });
    expect(degraded.level).toBe('degraded');
    expect(degraded.reasons.length).toBeGreaterThan(0);
  });

  it('distinguishes IRP failure from network failure', () => {
    expect(
      classifyFailure({
        runtimeFault: false,
        selfUnhealthy: false,
        networkDegraded: true,
        dependencyFault: false,
      }),
    ).toBe('network-external');

    expect(
      classifyFailure({
        runtimeFault: true,
        selfUnhealthy: false,
        networkDegraded: true,
        dependencyFault: false,
      }),
    ).toBe('irp-internal');

    expect(
      classifyFailure({
        runtimeFault: false,
        selfUnhealthy: false,
        networkDegraded: false,
        dependencyFault: true,
      }),
    ).toBe('dependency-degraded');
  });

  it('covers the full degradation matrix and stays local without optional deps', () => {
    expect(degradationFaults).toHaveLength(12);

    // Optional remote/AI/telemetry outages never halt local control.
    for (const fault of [
      'ai-unavailable',
      'federation-unavailable',
      'analytics-unavailable',
      'telemetry-outage',
    ] as const) {
      expect(evaluateDegradation(fault).verdict).toBe('continue-local');
    }

    // Unsafe states halt fast instead of mutating blindly.
    for (const fault of [
      'daemon-crash',
      'partial-startup',
      'corrupt-runtime-state',
      'malformed-config',
    ] as const) {
      expect(evaluateDegradation(fault).verdict).toBe('halt');
    }

    // Recoverable degradation continues with explicit fallback.
    for (const fault of [
      'stale-runtime-state',
      'database-outage',
      'plugin-crash',
      'interrupted-transaction',
    ] as const) {
      const decision = evaluateDegradation(fault);
      expect(decision.verdict).toBe('continue-degraded');
      expect(decision.fallback.length).toBeGreaterThan(0);
    }
  });
});
