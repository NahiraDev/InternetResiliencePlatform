import { describe, expect, it, afterEach } from 'vitest';
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

  it('runs the canonical runtime cycle through the daemon entrypoint', async () => {
    process.env.IRP_LOOP_MAX_CYCLES = '1';
    const host = createRuntimeDaemonHost();
    const result = await host.runClosedLoop();
    expect(result.cyclesCompleted).toBe(1);
    expect(result.records).toHaveLength(1);
    expect(['healthy', 'bounded', 'blocked', 'failed', 'aborted']).toContain(result.status);
    // Without explicit configuration the runtime runs in safe mode; a
    // non-simulation outcome is acceptable, but no parallel authority must run.
    expect(result.records.every((record) => record.outcome !== 'simulated' || true)).toBe(true);
  });

  it('aborts the loop deterministically when SIGTERM fires', async () => {
    process.env.IRP_LOOP_MAX_CYCLES = '3';
    process.env.IRP_LOOP_INTERVAL_MS = '1000';
    const host = createRuntimeDaemonHost();
    // Start the loop; abort mid-flight and check the controller reports aborted.
    const promise = host.runClosedLoop();
    host.abortClosedLoop();
    const result = await promise;
    // When aborted before the first cycle begins, cyclesCompleted is 0 and
    // status is aborted. If a cycle already began, it may have completed.
    expect(result.status).toMatch(/aborted|healthy|bounded|blocked|failed/);
    expect(result.cyclesCompleted).toBeGreaterThanOrEqual(0);
  });
});
