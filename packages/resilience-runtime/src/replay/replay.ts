import type { DecisionReplayInput, DecisionReplayResult } from '../domain/types.js';
import { createRuntimeContext } from '../context/context.js';
import { DeterministicPlanner } from '../planning/planner.js';
export class DecisionReplayEngine {
  constructor(private readonly planner = new DeterministicPlanner()) {}
  async replay(input: DecisionReplayInput): Promise<DecisionReplayResult> {
    const context = createRuntimeContext({
      ...input.record.runtimeContext,
      mode: 'simulation',
    });
    const selectedPlan = await this.planner.plan(input.candidates, context);
    const original = input.record.selectedPlan?.selectedAction.id;
    const reproduced = selectedPlan.selectedAction.id === original;
    return {
      reproduced,
      selectedPlan,
      outcome: 'simulated',
      differences: reproduced
        ? []
        : [`selected ${selectedPlan.selectedAction.id} instead of ${original}`],
    };
  }
}
