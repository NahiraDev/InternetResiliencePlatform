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
    const intent = context.compiledIntents?.[0] ?? context.compiledIntent;
    const { plan: selectedPlan } = await this.planner.planAgainstObjectives(
      input.candidates,
      context,
      intent === undefined ? {} : { intent },
    );
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
