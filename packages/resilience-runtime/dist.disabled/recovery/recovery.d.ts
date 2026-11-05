import type { ActionPlan, RecoveryPlan, RuntimeContext } from '../domain/types.js';
import type { CanonicalNetworkControlPlane } from '../canonical-network-adapter.js';
import { RuntimeAdapterRegistry } from '../adapter-registry.js';
export declare class FailoverRecoveryProvider {
    private readonly adapters;
    private readonly controlPlane?;
    constructor(adapters?: RuntimeAdapterRegistry, controlPlane?: CanonicalNetworkControlPlane | undefined);
    recover(plan: ActionPlan, reason: string, context: RuntimeContext): Promise<RecoveryPlan>;
    private buildRecoveryAdapters;
    private toFailure;
    private failureDomain;
    private failed;
}
//# sourceMappingURL=recovery.d.ts.map