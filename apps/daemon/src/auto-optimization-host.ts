import { AutoOptimizationEngine, defaultAutoOptimizationPolicy } from '@irp/auto-optimization';

export interface AutoOptimizationHostPorts {
  enabled?: boolean;
}

export class AutoOptimizationHost {
  readonly engine: AutoOptimizationEngine;
  readonly enabled: boolean;

  constructor({ enabled = false }: AutoOptimizationHostPorts = {}) {
    this.enabled = enabled;
    this.engine = new AutoOptimizationEngine(defaultAutoOptimizationPolicy(), {});
  }
}
