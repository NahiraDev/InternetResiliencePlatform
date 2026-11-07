import type { ActionExecution, ActionIntent, ActionPlan, ActionVerification, RuntimeContext } from './domain/types.js';
import { type CanonicalNetworkControlPlane } from './canonical-network-adapter.js';
export type RuntimeSubsystem = 'network-intelligence' | 'connectivity' | 'dns' | 'routing' | 'tunnel' | 'failover' | 'kernel' | 'plugin';
export interface RuntimeAdapterDescriptor {
    adapterId: string;
    subsystem: RuntimeSubsystem;
    version: string;
    capabilities: readonly string[];
    supportedActions: readonly ActionIntent[];
    supportsSimulation: boolean;
    supportsSafe: boolean;
    supportsLive: boolean;
    requiredPermissions: readonly string[];
    requiredKernelCapabilities: readonly string[];
    verificationSupport: boolean;
    recoverySupport: boolean;
}
export interface RuntimeAdapter {
    readonly descriptor: RuntimeAdapterDescriptor;
    execute(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution>;
    verify(plan: ActionPlan, execution: ActionExecution, context: RuntimeContext): Promise<ActionVerification>;
    rollback?(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution>;
    /**
     * Proves from observed state that `rollback` took effect. When absent, the boundary falls back
     * to re-running `verify`, which checks the post-mutation postconditions and so cannot confirm a
     * rollback of a mutation that failed verification.
     */
    verifyRollback?(plan: ActionPlan, context: RuntimeContext): Promise<ActionVerification>;
}
export declare class RuntimeAdapterRegistry {
    private readonly adapters;
    register(adapter: RuntimeAdapter): void;
    list(): RuntimeAdapterDescriptor[];
    findForAction(action: ActionIntent, capabilities: readonly string[]): RuntimeAdapter | undefined;
    requireCapability(capability: string): void;
}
export declare const createAdapterExecution: (plan: ActionPlan, context: RuntimeContext, simulated: boolean, status?: ActionExecution["status"]) => ActionExecution;
export declare const createAdapterVerification: (plan: ActionPlan, context: RuntimeContext, status?: ActionVerification["status"]) => ActionVerification;
export declare class DeterministicRuntimeAdapter implements RuntimeAdapter {
    readonly descriptor: RuntimeAdapterDescriptor;
    private readonly verificationStatus;
    constructor(descriptor: RuntimeAdapterDescriptor, verificationStatus?: ActionVerification['status']);
    execute(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution>;
    verify(plan: ActionPlan, _execution: ActionExecution, context: RuntimeContext): Promise<ActionVerification>;
    rollback(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution>;
}
export declare const createDefaultRuntimeAdapterRegistry: (networkControlPlane?: CanonicalNetworkControlPlane) => RuntimeAdapterRegistry;
//# sourceMappingURL=adapter-registry.d.ts.map