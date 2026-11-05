import type { RuntimeContext, RuntimeMode, CapabilitySnapshot, PolicySnapshot, ResiliencePolicy } from '../domain/types.js';
export declare const defaultPolicy: (mode?: RuntimeMode) => ResiliencePolicy;
export declare const createPolicySnapshot: (policy?: ResiliencePolicy) => PolicySnapshot;
export declare const createCapabilitySnapshot: (capabilities?: readonly string[], trusted?: boolean) => CapabilitySnapshot;
export declare const createRuntimeContext: (input?: Partial<RuntimeContext> & {
    runtimeId?: string;
    mode?: RuntimeMode;
}) => RuntimeContext;
//# sourceMappingURL=context.d.ts.map