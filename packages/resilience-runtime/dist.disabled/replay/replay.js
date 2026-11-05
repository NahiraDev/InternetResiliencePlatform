import { createRuntimeContext } from '../context/context.js';
import { DeterministicPlanner } from '../planning/planner.js';
export class DecisionReplayEngine {
    planner;
    constructor(planner = new DeterministicPlanner()) {
        this.planner = planner;
    }
    async replay(input) {
        const context = createRuntimeContext({
            ...input.record.runtimeContext,
            mode: 'simulation',
        });
        const intent = context.compiledIntents?.[0] ?? context.compiledIntent;
        const { plan: selectedPlan } = await this.planner.planAgainstObjectives(input.candidates, context, intent === undefined ? {} : { intent });
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
//# sourceMappingURL=replay.js.map