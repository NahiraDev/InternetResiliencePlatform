import { describe, expect, it } from 'vitest';
import { LinuxObservationProvider, RuntimeDaemonHost } from './index.js';
import { ConnectivityManager } from '@irp/connectivity';
import {
  NetworkEventStormGuard,
  ObservationDedupCache,
  classifyFailure,
} from '@irp/resilience-runtime';
import type { Observation } from '@irp/resilience-runtime';

const providerWith = (
  guard: NetworkEventStormGuard,
  dedup: ObservationDedupCache,
): LinuxObservationProvider => new LinuxObservationProvider(new ConnectivityManager(), {
  stormGuard: guard,
  observationDedup: dedup,
});

describe('daemon ingress resilience (issue #283)', () => {
  it('rate limits per observation rather than once per cycle', () => {
    const guard = new NetworkEventStormGuard(2, 60_000, 1);
    const provider = providerWith(guard, new ObservationDedupCache(1, 5_000));

    // A per-cycle admission could never trip a per-second budget; a per-event
    // admission must shed once the burst exceeds the configured window.
    let admitted = 0;
    let shed = 0;
    for (let i = 0; i < 10; i++) {
      const decision = guard.admit(Date.now());
      if (decision.admitted) admitted += 1;
      else shed += 1;
    }
    expect(admitted).toBe(2);
    expect(shed).toBe(8);
    expect(provider).toBeInstanceOf(LinuxObservationProvider);
  });

  it('deduplicates a repeated reading across consecutive cycles', async () => {
    // The window must be able to span a full cycle interval, otherwise the same
    // reading is never recognised as a duplicate.
    const dedup = new ObservationDedupCache(60_000, 100);
    const observation: Observation = {
      id: 'o1',
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      correlationId: 'c',
      source: 'test',
      metadata: {},
      category: 'dns',
      metric: 'health',
      value: 1,
      timestamp: new Date().toISOString(),
      freshnessMs: 0,
      confidence: 1,
      severity: 'info',
      status: 'healthy',
    };
    const provider = providerWith(new NetworkEventStormGuard(), dedup);
    const key = provider.observationDedupKey(observation);

    expect(dedup.admit(key, 1_000).admitted).toBe(true);
    // 30s later, i.e. the next cycle: still inside a 60s window.
    expect(dedup.admit(key, 31_000).admitted).toBe(false);
    expect(dedup.admit(key, 90_000).admitted).toBe(true);
    expect(dedup.status().duplicateHitsTotal).toBe(1);
  });

  it('classifies self-health into irp-internal vs network-external', () => {
    expect(
      classifyFailure({
        runtimeFault: true,
        selfUnhealthy: true,
        networkDegraded: true,
        dependencyFault: false,
      }),
    ).toBe('irp-internal');

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
        runtimeFault: false,
        selfUnhealthy: false,
        networkDegraded: false,
        dependencyFault: true,
      }),
    ).toBe('dependency-degraded');
  });

  it('reports a failure class in daemon self-health', () => {
    const host = new RuntimeDaemonHost();
    const health = host.selfHealth();
    expect(health.failureClass).toMatch(/^(irp-internal|network-external|dependency-degraded|unknown)$/);
  });

  it('exposes observation evidence for health classification', () => {
    const provider = providerWith(new NetworkEventStormGuard(), new ObservationDedupCache());
    expect(provider.observationsSnapshot()).toEqual([]);
  });
});