import { describe, expect, it } from 'vitest';
import {
  createSeededRandom,
  faultKinds,
  FAULT_CATALOG,
  runScenario,
  replayScenario,
  replayRecord,
  compareStrategies,
  projectRecord,
  type ScenarioDefinition,
} from '../src/index.js';

const scenario = (seed: string, name = 'lab-smoke'): ScenarioDefinition => ({
  schemaVersion: 1,
  name,
  seed,
  allowedActions: ['noop', 'dns_switch', 'health_reprobe'],
  steps: [{ fault: 'dns-failure' }, {}, { fault: 'tunnel-failure' }],
});

describe('Issue #282: Runtime Lab, Digital Twin, Failure Injection & Replay', () => {
  it('produces deterministic streams from seeds', () => {
    const a = createSeededRandom('lab-seed-1');
    const b = createSeededRandom('lab-seed-1');
    const valuesA = [a(), a(), a(), a()];
    expect([b(), b(), b(), b()]).toEqual(valuesA);

    const other = createSeededRandom('lab-seed-2');
    expect(other()).not.toBe(valuesA[0]);
  });

  it('covers the full fault catalog from the issue task list', () => {
    const kinds = new Set(faultKinds);
    // Interface/provider/gateway/DNS/route/tunnel/destination failures.
    for (const kind of [
      'interface-failure',
      'provider-failure',
      'gateway-failure',
      'dns-failure',
      'route-failure',
      'tunnel-failure',
      'destination-failure',
    ] as const) {
      expect(kinds.has(kind), `missing ${kind}`).toBe(true);
    }
    // Latency/jitter/loss/throughput degradation.
    for (const kind of [
      'latency-degradation',
      'jitter-degradation',
      'packet-loss',
      'throughput-degradation',
    ] as const) {
      expect(kinds.has(kind), `missing ${kind}`).toBe(true);
    }
    // Provider switching, path and failure-domain changes.
    for (const kind of ['provider-switch', 'path-change', 'failure-domain-change'] as const) {
      expect(kinds.has(kind), `missing ${kind}`).toBe(true);
    }
    // Federation loss, stale decisions, concurrent plans.
    for (const kind of ['federation-loss', 'stale-decision', 'concurrent-plans'] as const) {
      expect(kinds.has(kind), `missing ${kind}`).toBe(true);
    }
    // Policy changes, verification failure, rollback failure.
    for (const kind of ['policy-change', 'verification-failure', 'rollback-failure'] as const) {
      expect(kinds.has(kind), `missing ${kind}`).toBe(true);
    }
    expect(FAULT_CATALOG['dns-failure'].category).toBe('dns');
    expect(FAULT_CATALOG['federation-loss'].status).toBe('degraded');
  });

  it('reproduces identical record streams for identical definitions', async () => {
    const first = await runScenario(scenario('repro-seed'));
    const second = await runScenario(scenario('repro-seed'));
    expect(second.records.map(projectRecord)).toEqual(first.records.map(projectRecord));
    expect(first.records.length).toBe(3);
  });

  it('uses deterministic seeded observation timestamps', async () => {
    const first = await runScenario(scenario('timestamp-seed'));
    const second = await runScenario(scenario('timestamp-seed'));
    const timestamps = (records: typeof first.records) =>
      [...records].flatMap((record) =>
        record.observations.observations.map((observation) => observation.timestamp),
      );
    expect(timestamps(second.records)).toEqual(timestamps(first.records));
  });

  it('replays incidents from captured scenario definitions', async () => {
    const original = await runScenario(scenario('replay-seed'));
    const revived = JSON.parse(JSON.stringify(original.scenario)) as ScenarioDefinition;
    const replayed = await replayScenario({ scenario: revived, records: [] });
    expect(replayed.records.map(projectRecord)).toEqual(original.records.map(projectRecord));
  });

  it('replays a captured record through the canonical replay engine', async () => {
    const run = await runScenario(scenario('record-replay-seed'));
    const result = await replayRecord(run.records[0]);
    expect(result.outcome).toBe('simulated');
    expect(result.reproduced).toBe(true);
    expect(result.differences).toEqual([]);
  });

  it('compares strategies what-if style on the same scenario', async () => {
    const base = scenario('whatif-seed');
    const same = await compareStrategies(base, 'conservative', ['noop'], 'conservative-copy', [
      'noop',
    ]);
    expect(same.identical).toBe(true);
    expect(same.outcomesA).toHaveLength(same.outcomesB.length);

    const split = await compareStrategies(base, 'active', ['dns_switch', 'noop'], 'passive', [
      'noop',
    ]);
    expect(split.scenario).toBe(base.name);
    expect(split.outcomesA).toHaveLength(split.outcomesB.length);
    expect(split.identical).toBe(false);
  });

  it('never bypasses canonical semantics: simulation only, no live execution', async () => {
    const run = await runScenario(scenario('semantics-seed'));
    for (const record of run.records) {
      expect(record.runtimeContext.mode).toBe('simulation');
      expect(record.executionResult).toBeUndefined();
    }
  });
});
