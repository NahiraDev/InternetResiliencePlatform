import { AutoOptimizationEngine } from '@irp/auto-optimization';
export interface AutoOptimizationHostPorts {
    enabled?: boolean;
}
export declare class AutoOptimizationHost {
    readonly engine: AutoOptimizationEngine;
    readonly enabled: boolean;
    constructor({ enabled }?: AutoOptimizationHostPorts);
}
//# sourceMappingURL=auto-optimization-host.d.ts.map