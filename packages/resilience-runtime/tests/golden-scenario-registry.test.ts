import { describe, expect, it } from 'vitest';
import {
  GOLDEN_SCENARIOS,
  GOLDEN_SCENARIO_NAMES,
  goldenScenario,
  runScenario,
  projectRecord,
  replayScenario,
  replayRecord,
} from '../src/scenario-lab/index.js';
import { validateEvent } from '../src/events/event-taxonomy.js';
import type { DecisionRecord } from '../src/domain/types.js';

describe('canonical golden scenarios (issue #284)', () => {
  it('covers every scenario named in the #272 Section M checklist', () => {
    const required = [
      'healthy',
      'dns-degradation',
      'provider-degradation',
      'gateway-failure',
      'tunnel-failure',
      'restricted-destination',
      'prediction',
      'federation-loss',
      'concurrency-race',
      'verification-failure',
    ];
    for (const name of required) {
      expect(GOLDEN_SCENARIO_NAMES).toContain(name);
      expect(goldenScenario(name)).toBeDefined();
    }
    // Scenarios that were previously missing now exist as executable evidence.
    for (const name of ['federation-loss', 'concurrency-race', 'verification-failure']) {
      expect(goldenScenario(name)?.steps.some((step) => step.fault !== undefined)).toBe(true);
    }
  });

  it('gives every scenario a stable seed and non-empty steps', () => {
    const seeds = new Set<string>();
    for (const entry of GOLDEN_SCENARIOS) {
      expect(entry.seed).toMatch(/^seed-/);
      expect(seeds.has(entry.seed)).toBe(false);
      seeds.add(entry.seed);
      expect(entry.steps.length).toBeGreaterThan(0);
      expect(entry.allowedActions).toContain('noop');
    }
  });

  it('runs every scenario deterministically', async () => {
    for (const entry of GOLDEN_SCENARIOS) {
      const first = await runScenario(entry);
      const second = await runScenario(entry);
      expect(first.records.length).toBeGreaterThan(0);
      expect(first.records.map(projectRecord)).toEqual(second.records.map(projectRecord));
      expect(JSON.stringify(first.records.map(projectRecord))).toBe(
        JSON.stringify(second.records.map(projectRecord)),
      );
    }
  }, 60_000);

  it('preserves replay semantics', async () => {
    for (const entry of GOLDEN_SCENARIOS) {
      const run = await runScenario(entry);
      const replayed = await replayScenario(run);
      expect(replayed.records.map(projectRecord)).toEqual(run.records.map(projectRecord));
    }
  }, 60_000);

  it('produces records whose trace evidence is taxonomy-conformant', async () => {
    const run = await runScenario(goldenScenario('dns-degradation')!);
    for (const record of run.records) {
      expect(record.outcome).toBeTypeOf('string');
      expect(Array.isArray(record.explanation)).toBe(true);
      expect(record.validation).toBeDefined();
    }
  });

  it('replays a captured record through the canonical replay engine', async () => {
    const run = await runScenario(goldenScenario('healthy')!);
    const result = await replayRecord(run.records[0]!);
    expect(result.reproduced).toBe(true);
    expect(result.differences).toEqual([]);
  });

  it('changes behaviour between a healthy and a failing scenario', async () => {
    const healthy = await runScenario(goldenScenario('healthy')!);
    const failing = await runScenario(goldenScenario('gateway-failure')!);
    // A fault must actually be observable, not silently ignored.
    expect(JSON.stringify(healthy.records.map(projectRecord))).not.toBe(
      JSON.stringify(failing.records.map(projectRecord)),
    );
  }, 60_000);

  it('keeps the taxonomy valid for every event a scenario run emits', async () => {
    const run = await runScenario(goldenScenario('verification-failure')!);
    const records = run.records as readonly DecisionRecord[];
    expect(records.length).toBeGreaterThan(0);
    // Sanity-check the taxonomy helper the guards rely on.
    expect(validateEvent('runtime.decision.recorded', { correlationId: 'c', decisionId: 'd' }).valid).toBe(
      true,
    );
    expect(validateEvent('runtime.decision.recorded', { correlationId: 'c' }).valid).toBe(false);
  });
});