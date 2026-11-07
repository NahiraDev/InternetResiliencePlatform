import type { ActionPlan, ActionValidation, RuntimeContext } from '../domain/types.js';
import { RuntimePolicyArbitrator } from '../policy/policy.js';
import { RuntimeAdapterRegistry } from '../adapter-registry.js';
export declare class RuntimeActionValidator {
    private readonly policy;
    private readonly adapters;
    private readonly active;
    constructor(policy?: RuntimePolicyArbitrator, adapters?: RuntimeAdapterRegistry);
    lock(key: string): boolean;
    release(key: string): void;
    isActive(key: string): boolean;
    validate(plan: ActionPlan, context: RuntimeContext, activeOperation?: boolean): Promise<ActionValidation>;
}
//# sourceMappingURL=validation.d.ts.map