/**
 * Deterministic scenario runner, what-if comparison and incident replay
 * for issue #282.
 *
 * Every scenario executes through the canonical `ResilienceRuntime.cycle`
 * in `simulation` mode with the same policy/safety/verification semantics
 * as production. Simulation therefore cannot bypass canonical semantics:
 * it reuses them.
 */
import type { ActionIntent, DecisionRecord } from '../domain/types.js';
import { type FaultKind } from './faults.js';
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
/** Runs a scenario deterministically through the canonical runtime. */
export declare const runScenario: (scenario: ScenarioDefinition) => Promise<ScenarioRun>;
/** Semantic projection used for determinism and replay comparisons. */
export declare const projectRecord: (record: DecisionRecord) => string;
/**
 * What-if planning: runs the same deterministic scenario under two
 * strategies (allowed-action sets) and compares semantic outcomes.
 */
export declare const compareStrategies: (scenario: ScenarioDefinition, strategyA: string, allowedA: readonly ActionIntent[], strategyB: string, allowedB: readonly ActionIntent[]) => Promise<StrategyComparison>;
/**
 * Incident replay from a captured scenario definition: re-running the same
 * definition must reproduce the same semantic record stream. Also replays a
 * single captured record through the canonical replay engine.
 */
export declare const replayScenario: (run: ScenarioRun) => Promise<ScenarioRun>;
export declare const replayRecord: (record: DecisionRecord) => Promise<import("../domain/types.js").DecisionReplayResult>;
//# sourceMappingURL=scenario.d.ts.map