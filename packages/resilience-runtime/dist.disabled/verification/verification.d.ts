import type { ActionExecution, ActionPlan, ActionVerification, RuntimeContext } from '../domain/types.js';
import { RuntimeAdapterRegistry } from '../adapter-registry.js';
export declare class RuntimeActionVerifier {
    private readonly adapters;
    constructor(adapters?: RuntimeAdapterRegistry);
    verify(plan: ActionPlan, execution: ActionExecution, context: RuntimeContext): Promise<ActionVerification>;
}
//# sourceMappingURL=verification.d.ts.map