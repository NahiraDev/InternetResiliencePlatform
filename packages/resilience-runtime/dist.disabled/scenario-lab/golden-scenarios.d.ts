/**
 * Canonical golden scenarios for issue #284 (issue #272 Section M).
 *
 * These were previously defined ad hoc inside two test files with duplicated
 * helpers and non-deterministic inputs (`new Date().toISOString()`). Defining
 * them here makes the scenario set a single registry that is executable evidence
 * rather than a claim, and gives every scenario a stable seed so replay is
 * reproducible.
 */
import type { ScenarioDefinition } from './scenario.js';
/** Every golden scenario required by the #272 Section M checklist. */
export declare const GOLDEN_SCENARIOS: readonly ScenarioDefinition[];
export declare const goldenScenario: (name: string) => ScenarioDefinition | undefined;
export declare const GOLDEN_SCENARIO_NAMES: readonly string[];
//# sourceMappingURL=golden-scenarios.d.ts.map