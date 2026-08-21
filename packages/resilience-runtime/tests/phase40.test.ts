import { describe, expect, it } from 'vitest';
import { runPhase40Validation } from '../src/index.js';

describe('Phase 40 end-to-end resilience validation', () => {
  it('passes all deterministic acceptance criteria', async () => {
    const report = await runPhase40Validation();

    expect(report.status).toBe('passed');
    expect(report.deterministic).toBe(true);
    expect(report.failedCriteria).toEqual([]);
    expect(report.scenarios).toHaveLength(4);
    expect(report.acceptance).toEqual({
      completeStageOrderCovered: true,
      healthyPathRecorded: true,
      degradedPathDetected: true,
      persistentDegradationDetected: true,
      destinationIsolationRepresented: true,
      decisionsAreUnique: true,
    });
  });

  it('reproduces the same scenario shape across repeated runs', async () => {
    const first = await runPhase40Validation();
    const second = await runPhase40Validation();

    expect(first.status).toBe(second.status);
    expect(first.failedCriteria).toEqual(second.failedCriteria);
    expect(first.scenarios.map((scenario) => scenario.name)).toEqual(
      second.scenarios.map((scenario) => scenario.name),
    );
    expect(first.scenarios.map((scenario) => scenario.outcomes)).toEqual(
      second.scenarios.map((scenario) => scenario.outcomes),
    );
    expect(first.scenarios.map((scenario) => scenario.incidents)).toEqual(
      second.scenarios.map((scenario) => scenario.incidents),
    );
  });
});
