import type { ActionExecution, ActionPlan, RuntimeContext } from '../domain/types.js';
import { RuntimeAdapterRegistry } from '../adapter-registry.js';
export declare class CoordinatedActionExecutor {
    private readonly adapters;
    private readonly inFlight;
    constructor(adapters?: RuntimeAdapterRegistry);
    execute(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution>;
    private doExecute;
}
//# sourceMappingURL=execution.d.ts.map