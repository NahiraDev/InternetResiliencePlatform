import type { ActionExecution, ActionPlan, ActionVerification, RuntimeContext } from './domain/types.js';
import { type RuntimeAdapter, type RuntimeAdapterDescriptor } from './adapter-registry.js';
import type { CanonicalTunnelControlPlane } from './canonical-network-adapter.js';
export declare class CanonicalTunnelRuntimeAdapter implements RuntimeAdapter {
    private readonly controlPlane;
    readonly descriptor: RuntimeAdapterDescriptor;
    constructor(controlPlane: CanonicalTunnelControlPlane);
    execute(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution>;
    verify(plan: ActionPlan, execution: ActionExecution, context: RuntimeContext): Promise<ActionVerification>;
    rollback(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution>;
}
//# sourceMappingURL=canonical-tunnel-adapter.d.ts.map