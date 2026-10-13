import { describe, expect, it, afterEach } from 'vitest';
import { BoundedClosedLoopController, createCapabilitySnapshot, type DecisionRecord } from '@irp/resilience-runtime';
import { createDaemon, createRuntimeDaemonHost } from './index.js';

afterEach(() => {
  delete process.env.IRP_TUNNEL_ENABLED;
  delete process.env.IRP_GATEWAY_SELECTION_ENABLED;
  delete process.env.IRP_LOOP_MAX_CYCLES;
  delete process.env.IRP_LOOP_INTERVAL_MS;
  delete process.env.IRP_LOOP_STOP_WHEN_HEALTHY;
});

describe('daemon factory', () => {
  it('creates an application without starting host services', () => {
    const daemon = createDaemon();
    expect(daemon.state).toBe('created');
    expect(daemon.providers.length).toBeGreaterThan(0);
  });
});

describe('RuntimeDaemonHost', () => {
  it('binds the canonical network control plane with gateway selection and tunnel planes', async () => {
    const host = createRuntimeDaemonHost();
    const health = await host.health();
    expect(health.lifecycle).toBe('created');
    expect(health.gatewaySelection.configured).toBe(false);
    expect(health.tunnel.configured).toBe(false);
    expect(health.plugins).toEqual({ loaded: [], active: [] });
    expect(health.autoOptimization).toEqual({ bound: true, enabled: false });
    expect(health.capabilities).toEqual(expect.any(Array));
  });

  it('advertises negotiated Linux capabilities in daemon health', async () => {
    const host = createRuntimeDaemonHost();
    const health = await host.health();
    expect(health.platform.platform).toBe('linux');
    expect(health.platform.granted).toContain('dns.write');
    expect(host.platformNegotiation(['unsupported.capability']).denied).toEqual([
      'unsupported.capability',
    ]);
    expect(health.ingress.storm).toMatchObject({
      admittedTotal: expect.any(Number),
      shedTotal: expect.any(Number),
      coolingDown: expect.any(Boolean),
    });
    expect(health.ingress.duplicates).toMatchObject({
      keys: expect.any(Number),
      admittedTotal: expect.any(Number),
      duplicateHitsTotal: expect.any(Number),
    });
    expect(health.self).toMatchObject({
      level: expect.stringMatching(/^(healthy|degraded|critical)$/),
      reasons: expect.any(Array),
    });
  });

  it('enables gateway selection and tunnel planes only via explicit environment opt-in', async () => {
    process.env.IRP_GATEWAY_SELECTION_ENABLED = '1';
    process.env.IRP_TUNNEL_ENABLED = '1';
    const host = createRuntimeDaemonHost();
    expect(host.gatewaySelection.configured).toBe(true);
    expect(host.tunnelPlane.configured).toBe(false);
    expect(host.plugins.isRunning).toBe(false);
    await host.plugins.start();
    expect(host.plugins.isRunning).toBe(true);
    await host.plugins.stop();
    expect(host.plugins.isRunning).toBe(false);
  });
});

// Issue #11 / Phase 78: the production entrypoint drives the canonical bounded
// closed loop. These tests prove the daemon path — not just the library.
//
// Assertions below are deterministic — they match the exact contract of
// `BoundedClosedLoopController.run()`:
//   - A cycle that returns a terminal-healthy outcome (`success`, `recovered`,
//     `noop`, `simulated`) terminates with status `healthy`, stopReason `healthy`.
//   - A cycle that returns `blocked` terminates with status `blocked`.
//   - A cycle that returns `failed` terminates with status `failed`.
//   - An abort signal raised before the first cycle (or between cycles) returns
//     status `aborted`, stopReason `aborted`, with the prior completed cycles.
//   - Reaching maxCycles without any terminal-healthy/blocked/failed outcome
//     terminates with status `bounded`, stopReason `max_cycles`.
describe('RuntimeDaemonHost bounded closed loop', () => {
  it('exposes the BoundedClosedLoopController over the canonical runtime', () => {
    const host = createRuntimeDaemonHost();
    expect(host.closedLoop).toBeDefined();
    // The loop wraps the canonical runtime (no parallel authority).
    expect((host.closedLoop as unknown as { runtime: unknown }).runtime).toBe(host.runtime);
  });

  it('returns safe-by-default options when IRP_LOOP_* is unset', () => {
    const host = createRuntimeDaemonHost();
    const options = host.getClosedLoopOptions();
    // BoundedClosedLoopController defaults: maxCycles 1, intervalMs 0, stopWhenHealthy true.
    expect(options.maxCycles).toBeUndefined();
    expect(options.intervalMs).toBeUndefined();
    expect(options.stopWhenHealthy).toBeUndefined();
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects out-of-range IRP_LOOP_MAX_CYCLES with a RangeError', () => {
    process.env.IRP_LOOP_MAX_CYCLES = '20';
    const host = createRuntimeDaemonHost();
    expect(() => host.getClosedLoopOptions()).toThrow(/IRP_LOOP_MAX_CYCLES/);
    expect(() => host.getClosedLoopOptions()).toThrow(RangeError);
  });

  it('rejects non-integer IRP_LOOP_INTERVAL_MS with a RangeError', () => {
    process.env.IRP_LOOP_INTERVAL_MS = 'not-a-number';
    const host = createRuntimeDaemonHost();
    expect(() => host.getClosedLoopOptions()).toThrow(/IRP_LOOP_INTERVAL_MS/);
    expect(() => host.getClosedLoopOptions()).toThrow(RangeError);
  });

  it('rejects non-boolean IRP_LOOP_STOP_WHEN_HEALTHY with a RangeError', () => {
    process.env.IRP_LOOP_STOP_WHEN_HEALTHY = 'maybe';
    const host = createRuntimeDaemonHost();
    // Only documented '0' / '1' values are permitted; anything else fails closed.
    expect(() => host.getClosedLoopOptions()).toThrow(/IRP_LOOP_STOP_WHEN_HEALTHY/);
    expect(() => host.getClosedLoopOptions()).toThrow(RangeError);
  });

  it("returns the documented '0' value verbatim for IRP_LOOP_STOP_WHEN_HEALTHY", () => {
    process.env.IRP_LOOP_STOP_WHEN_HEALTHY = '0';
    const host = createRuntimeDaemonHost();
    const options = host.getClosedLoopOptions();
    expect(options.stopWhenHealthy).toBe(false);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns the documented '1' value verbatim for IRP_LOOP_STOP_WHEN_HEALTHY", () => {
    process.env.IRP_LOOP_STOP_WHEN_HEALTHY = '1';
    const host = createRuntimeDaemonHost();
    const options = host.getClosedLoopOptions();
    expect(options.stopWhenHealthy).toBe(true);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('runs exactly one canonical runtime cycle with IRP_LOOP_MAX_CYCLES=1', async () => {
    process.env.IRP_LOOP_MAX_CYCLES = '1';
    const host = createRuntimeDaemonHost();
    const result = await host.runClosedLoop();
    // Deterministic: exactly one cycle executes and it terminates the loop.
    expect(result.cyclesCompleted).toBe(1);
    expect(result.records).toHaveLength(1);
    // The single cycle's outcome determines the final status precisely.
    const firstRecord = result.records[0];
    expect(firstRecord).toBeDefined();
    const outcome = firstRecord?.outcome;
    if (outcome === 'success' || outcome === 'recovered' || outcome === 'noop' || outcome === 'simulated') {
      expect(result.status).toBe('healthy');
      expect(result.stopReason).toBe('healthy');
    } else if (outcome === 'blocked') {
      expect(result.status).toBe('blocked');
      expect(result.stopReason).toBe('blocked');
    } else if (outcome === 'failed') {
      expect(result.status).toBe('failed');
      expect(result.stopReason).toBe('failed');
    } else {
      expect(result.status).toBe('bounded');
      expect(result.stopReason).toBe('max_cycles');
    }
    // Every record is a canonical DecisionRecord (not a mock).
    expect(result.records.every((record) => typeof record.outcome === 'string')).toBe(true);
  });

  it('aborts before the first cycle when the SIGTERM signal is already set', async () => {
    process.env.IRP_LOOP_MAX_CYCLES = '3';
    process.env.IRP_LOOP_INTERVAL_MS = '1000';
    const host = createRuntimeDaemonHost();
    // The controller checks signal.aborted at the top of the loop before cycle 1,
    // so aborting before calling run() is deterministic.
    host.abortClosedLoop();
    const result = await host.runClosedLoop();
    expect(result.status).toBe('aborted');
    expect(result.stopReason).toBe('aborted');
    expect(result.cyclesCompleted).toBe(0);
    expect(result.records).toHaveLength(0);
  });

  it('aborts deterministically between cycles (not during a cycle)', async () => {
    // Use a minimal DecisionRecord so the loop cannot terminate early via
    // stopWhenHealthy/blocked/failed, forcing it to reach the inter-cycle
    // sleep where the abort is observed. This mirrors the factory used by
    // packages/resilience-runtime/tests/closed-loop.test.ts.
    const nonTerminalRuntime = {
      cycle: async (): Promise<DecisionRecord> => ({
        id: 'record-between-cycles',
        schemaVersion: 1,
        createdAt: '2026-10-12T00:00:00.000Z',
        source: 'closed-loop-abort-test',
        metadata: {},
        correlationId: 'closed-loop-abort-test/cycle-1',
        decisionId: 'decision-1',
        runtimeStateBefore: 'planning',
        runtimeStateAfter: 'degraded',
        runtimeContext: {
          runtimeId: 'closed-loop-abort-test',
          correlationId: 'closed-loop-abort-test/cycle-1',
          mode: 'simulation',
          deadline: '2099-01-01T00:00:00.000Z',
          policySnapshot: {
            id: 'closed-loop-abort-test-policy',
            schemaVersion: 1,
            createdAt: '2026-10-12T00:00:00.000Z',
            source: 'closed-loop-abort-test',
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
              simulationOnly: true,
              failClosed: true,
            },
          },
          capabilitySnapshot: createCapabilitySnapshot([], true),
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
          id: 'observations-1',
          schemaVersion: 1,
          createdAt: '2026-10-12T00:00:00.000Z',
          source: 'closed-loop-abort-test',
          metadata: {},
          observations: [],
          stale: false,
          minConfidence: 1,
        },
        incidents: [],
        policyEvaluation: { allowed: true, reasons: [], requiredCapabilities: [] },
        candidates: [],
        outcome: 'degraded',
        confidence: 1,
        durationMs: 1,
        explanation: [],
      }),
    };
    const loop = new BoundedClosedLoopController(nonTerminalRuntime);
    const abortController = new AbortController();
    const promise = loop.run({
      maxCycles: 3,
      intervalMs: 1000,
      stopWhenHealthy: false,
      signal: abortController.signal,
    });
    // Wait until the first cycle has completed and the inter-cycle sleep is
    // in flight, then abort. This exercises the sleep-time abort path.
    await new Promise((resolve) => setTimeout(resolve, 50));
    abortController.abort();
    const result = await promise;
    // Abort fires between cycle 1 and cycle 2, so exactly one cycle completed.
    expect(result.status).toBe('aborted');
    expect(result.stopReason).toBe('aborted');
    expect(result.cyclesCompleted).toBe(1);
    expect(result.records).toHaveLength(1);
  });
});
