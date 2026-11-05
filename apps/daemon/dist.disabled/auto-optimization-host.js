import { AutoOptimizationEngine, defaultAutoOptimizationPolicy } from '@irp/auto-optimization';
export class AutoOptimizationHost {
    engine;
    enabled;
    constructor({ enabled = false } = {}) {
        this.enabled = enabled;
        this.engine = new AutoOptimizationEngine(defaultAutoOptimizationPolicy(), {});
    }
}
//# sourceMappingURL=auto-optimization-host.js.map