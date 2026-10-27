/**
 * Deterministic scenario runner, what-if comparison and incident replay
 * for issue #282.
 *
 * Every scenario executes through the canonical `ResilienceRuntime.cycle`
 * in `simulation` mode with the same policy/safety/verification semantics
 * as production. Simulation therefore cannot bypass canonical semantics:
 * it reuses them.
 */

import type { ActionIntent, DecisionRecord, Observation } from '../domain/types.js';
import {
  createCapabilitySnapshot,
  createPolicySnapshot,
  defaultPolicy,
} from '../context/context.js';
import { StaticObservationProvider } from '../observations/observations.js';
import { ResilienceRuntime } from '../runtime.js';
import { DecisionReplayEngine } from '../replay/replay.js';
import { FAULT_CATALOG, type FaultKind } from './faults.js';
import { createSeededRandom } from './seed.js';

export interface ScenarioStep {
  /** Fault injected on this step; omit for a healthy step. */
  readonly fault?: FaultKind;
  /** Runtime cycles to execute for this step. Defaults to 1. */
  readonly cycles?: number;
}

export interface ScenarioDefinition {
  readonly schemaVersion: 1;
  readonly name: string;
  readonly seed: string;
  readonly steps: readonly ScenarioStep[];
  readonly allowedActions: readonly ActionIntent[];
}

export interface ScenarioRun {
  readonly scenario: ScenarioDefinition;
  readonly records: readonly DecisionRecord[];
}

export interface StrategyComparison {
  readonly scenario: string;
  readonly strategyA: string;
  readonly strategyB: string;
  readonly outcomesA: readonly string[];
  readonly outcomesB: readonly string[];
  readonly identical: boolean;
}

const SCENARIO_EPOCH_MS = Date.parse('2026-01-01T00:00:00.000Z');

/**
 * Scenario deadline budget.
 *
 * Generous relative to simulated work so the deadline never becomes the
 * variable that decides a scenario, while still being a real, explicit bound.
 */
const SCENARIO_DEADLINE_MS = 10 * 60_000;

const buildObservation = (
  scenario: ScenarioDefinition,
  stepIndex: number,
  cycleIndex: number,
): Observation => {
  const step = scenario.steps[stepIndex];
  const random = createSeededRandom(`${scenario.seed}:${stepIndex}:${cycleIndex}`);
  const jitter = Math.floor(random() * 1000);
  // Deterministic scenario clock: keep inputs reproducible without depending on
  // wall-clock time. Downstream runtime records still carry their own IDs and
  // timestamps; semantic comparison uses projectRecord.
  const at = new Date(
    SCENARIO_EPOCH_MS + stepIndex * 60_000 + cycleIndex * 1_000 + jitter,
  ).toISOString();
  if (!step?.fault) {
    return {
      id: `scenario-${scenario.seed}-${stepIndex}-${cycleIndex}-healthy`,
      schemaVersion: 1,
      createdAt: at,
      correlationId: scenario.name,
      source: 'scenario-lab',
      metadata: { seed: scenario.seed },
      category: 'connectivity',
      metric: 'health',
      value: 1,
      unit: 'state',
      timestamp: at,
      freshnessMs: 0,
      confidence: 0.9,
      severity: 'info',
      status: 'healthy',
    };
  }
  const spec = FAULT_CATALOG[step.fault];
  return {
    id: `scenario-${scenario.seed}-${stepIndex}-${cycleIndex}-${spec.kind}`,
    schemaVersion: 1,
    createdAt: at,
    correlationId: scenario.name,
    source: 'scenario-lab',
    metadata: { seed: scenario.seed, jitterMs: jitter, ...(spec.metadata ?? {}) },
    category: spec.category,
    metric: 'health',
    value: 1,
    unit: 'state',
    timestamp: at,
    freshnessMs: 0,
    confidence: 0.9,
    severity: 'critical',
    status: spec.status,
  };
};

const cycleContext = (
  scenario: ScenarioDefinition,
  allowedActions: readonly ActionIntent[],
  cycleIndex: number,
) => ({
  mode: 'simulation' as const,
  securityContext: { trusted: true },
  capabilitySnapshot: createCapabilitySnapshot(
    ['dns.write', 'connectivity.failover', 'route.write', 'gateway.select', 'tunnel.rotate'],
    true,
  ),
  policySnapshot: createPolicySnapshot({
    ...defaultPolicy('simulation'),
    allowedActions: [...allowedActions],
    deniedActions: [],
    simulationOnly: false,
  }),
  // A scenario-derived deadline. Without it the runtime defaults to
  // `now + 5s`, so a run that happened to be slower than five seconds produced a
  // different decision than an identical faster run.
  deadline: new Date(
    SCENARIO_EPOCH_MS + (cycleIndex + 1) * 60_000 + SCENARIO_DEADLINE_MS,
  ).toISOString(),
});

/** Runs a scenario deterministically through the canonical runtime. */
export const runScenario = async (scenario: ScenarioDefinition): Promise<ScenarioRun> => {
  const observations: Observation[] = [];
  scenario.steps.forEach((step, stepIndex) => {
    const cycles = step.cycles ?? 1;
    for (let cycleIndex = 0; cycleIndex < cycles; cycleIndex++) {
      observations.push(buildObservation(scenario, stepIndex, cycleIndex));
    }
  });
  const runtime = new ResilienceRuntime(
    [new StaticObservationProvider('scenario-lab', observations)],
    // A derived instance id keeps replayed records byte-comparable; the default
    // uses Math.random() and would differ on every run.
    { runtimeId: `scenario-lab-${scenario.seed}`, instanceId: `scenario-${scenario.name}` },
  );
  const records: DecisionRecord[] = [];
  for (let index = 0; index < observations.length; index++) {
    const context = cycleContext(scenario, scenario.allowedActions, index);
    records.push(
      await runtime.cycle({
        ...context,
        correlationId: `${scenario.name}/cycle-${index + 1}`,
        idempotencyKey: `${scenario.seed}/cycle-${index + 1}`,
      }),
    );
  }
  return { scenario, records: Object.freeze(records) };
};

/** Semantic projection used for determinism and replay comparisons. */
export const projectRecord = (record: DecisionRecord): string =>
  JSON.stringify({
    outcome: record.outcome,
    incidents: record.incidents.map((incident) => [incident.rootCause, incident.classification]),
    intent: record.selectedPlan?.selectedAction.intent ?? null,
    executed: record.executionResult !== undefined,
  });

/**
 * What-if planning: runs the same deterministic scenario under two
 * strategies (allowed-action sets) and compares semantic outcomes.
 */
export const compareStrategies = async (
  scenario: ScenarioDefinition,
  strategyA: string,
  allowedA: readonly ActionIntent[],
  strategyB: string,
  allowedB: readonly ActionIntent[],
): Promise<StrategyComparison> => {
  const runA = await runScenario({ ...scenario, allowedActions: allowedA });
  const runB = await runScenario({ ...scenario, allowedActions: allowedB });
  const outcomesA = runA.records.map(projectRecord);
  const outcomesB = runB.records.map(projectRecord);
  return {
    scenario: scenario.name,
    strategyA,
    strategyB,
    outcomesA: Object.freeze(outcomesA),
    outcomesB: Object.freeze(outcomesB),
    identical: JSON.stringify(outcomesA) === JSON.stringify(outcomesB),
  };
};

/**
 * Incident replay from a captured scenario definition: re-running the same
 * definition must reproduce the same semantic record stream. Also replays a
 * single captured record through the canonical replay engine.
 */
export const replayScenario = async (run: ScenarioRun): Promise<ScenarioRun> =>
  runScenario(run.scenario);

export const replayRecord = async (record: DecisionRecord) => {
  const engine = new DecisionReplayEngine();
  return engine.replay({ record, candidates: [...record.candidates] });
};
