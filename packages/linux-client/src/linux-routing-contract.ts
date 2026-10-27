/**
 * Production routing contract for the {@link KernelRuntime}.
 *
 * This is the concrete data-plane contract registered as namespace `routing`
 * on the kernel. It is the ONLY production routing contract — the test mocks
 * in `deep-runtime.integration.test.ts` and `index.test.ts` remain as test
 * doubles and must not be used in production.
 *
 * The contract delegates to {@link LinuxRouteExecutor} for the actual `ip
 * route` operations. It owns no policy, safety, or transaction authority — it
 * is the `apply` step behind the canonical {@link PrivilegedMutationBoundary}.
 */

import {
  createContract,
  type KernelContract,
} from '@irp/kernel';
import type { RoutePlan } from '@irp/routing';
import {
  LinuxRouteExecutor,
  type RouteCommandRunner,
  type RouteExecutorOptions,
} from './linux-route-executor.js';

export interface RoutingContractOptions extends RouteExecutorOptions {
  readonly commandRunner?: RouteCommandRunner;
}

/**
 * Creates the production routing contract.
 *
 * Operations:
 * - `applyRoutePlan`: validates the plan, captures a snapshot, and applies
 *   the route via `ip route replace`.
 * - `rollbackRoutePlan`: restores the prior route state from the captured
 *   snapshot via `ip route replace` or `ip route del`.
 *
 * Both operations require the `network.route` capability, enforced by the
 * kernel's {@link CapabilityAuthorizer} before dispatch.
 */
export function createLinuxRoutingContract(
  options: RoutingContractOptions = {},
): { contract: KernelContract; executor: LinuxRouteExecutor } {
  const executor = new LinuxRouteExecutor(options.commandRunner, options);

  const contract = createContract({
    namespace: 'routing',
    version: '1.0.0',
    operations: {
      applyRoutePlan: {
        capability: 'network.route',
        execute: async (input: unknown) => {
          const plan = input as RoutePlan;
          const result = await executor.applyRoutePlan(plan);
          if (!result.ok) {
            throw new Error(`route apply failed: ${result.error}`);
          }
          return { ok: true, planId: plan.id, snapshot: executor.getSnapshot(plan.id) };
        },
      },
      rollbackRoutePlan: {
        capability: 'network.route',
        execute: async (input: unknown) => {
          const plan = input as RoutePlan;
          const result = await executor.rollbackRoutePlan(plan);
          if (!result.ok) {
            throw new Error(`route rollback failed: ${result.error}`);
          }
          return { ok: true, planId: plan.id };
        },
      },
    },
  });

  return { contract, executor };
}
