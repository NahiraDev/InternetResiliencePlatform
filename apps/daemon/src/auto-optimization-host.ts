import {
  AutoOptimizationEngine,
  defaultAutoOptimizationPolicy,
  type AutoOptimizationPorts,
} from '@irp/auto-optimization';
import {
  CoordinatedActionExecutor,
  RuntimeActionValidator,
  RuntimeActionVerifier,
  type RuntimeAdapterRegistry,
  createAdapterExecution,
} from '@irp/resilience-runtime';
import type { ActionExecution, ActionPlan, RuntimeContext } from '@irp/resilience-runtime';

export interface AutoOptimizationHostPorts {
  adapters: RuntimeAdapterRegistry;
  enabled?: boolean;
}

export class AutoOptimizationHost {
  readonly engine: AutoOptimizationEngine;
  readonly enabled: boolean;

  constructor({ adapters, enabled = false }: AutoOptimizationHostPorts) {
    this.enabled = enabled;
    const validator = new RuntimeActionValidator(undefined, adapters);
    const executor = new CoordinatedActionExecutor(adapters);
    const verifier = new RuntimeActionVerifier(adapters);
    const rollback = async (
      plan: ActionPlan,
      execution: ActionExecution,
      context: RuntimeContext,
    ): Promise<ActionExecution> => {
      const adapter = adapters.findForAction(plan.selectedAction.intent, plan.requiredCapabilities);
      if (adapter?.rollback) return adapter.rollback(plan, context);
      return createAdapterExecution(plan, context, false, 'failed');
    };
    const ports: AutoOptimizationPorts = { validator, executor, verifier, rollback };
    this.engine = new AutoOptimizationEngine(defaultAutoOptimizationPolicy(), ports);
  }
}