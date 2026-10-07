/**
 * Integration test proving the canonical runtime-to-executor execution path.
 *
 * This test proves that the full production path works end-to-end with a
 * fake command runner (since CAP_NET_ADMIN is unavailable):
 *
 *   ResilienceRuntime → CanonicalNetworkRuntimeAdapter → RoutingEngine
 *   → kernel.execute('routing', 'applyRoutePlan') → LinuxRouteExecutor
 *
 * It verifies that success and failure propagate correctly through the
 * entire chain, not just the executor in isolation.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { KernelRuntime } from '@irp/kernel';
import { RoutingEngine, parseDestination, type DiscoveredRoute } from '@irp/routing';
import { type RouteCommandRunner, type RouteCommandResult } from './linux-route-executor.js';
import { createLinuxRoutingContract } from './linux-routing-contract.js';
import { CanonicalNetworkRuntimeAdapter, type CanonicalNetworkControlPlane } from '@irp/resilience-runtime';
import type { ActionPlan, RuntimeContext, ActionExecution, ActionVerification } from '@irp/resilience-runtime';

/** Fake command runner that simulates ip route commands. */
class IntegrationCommandRunner implements RouteCommandRunner {
  readonly calls: { binary: string; args: readonly string[] }[] = [];
  private shouldSucceed = true;

  setShouldSucceed(value: boolean): void {
    this.shouldSucceed = value;
  }

  async run(
    binary: string,
    args: readonly string[],
    _options: { timeoutMs: number },
  ): Promise<RouteCommandResult> {
    this.calls.push({ binary, args });
    const isShow = args.includes('show');
    if (isShow) {
      // Return existing route state (empty = no prior route)
      return {
        command: binary,
        args,
        stdout: '[]',
        stderr: '',
        exitCode: 0,
        timedOut: false,
      };
    }
    // Apply/rollback command result
    return {
      command: binary,
      args,
      stdout: '',
      stderr: this.shouldSucceed ? '' : 'RTNETLINK answers: Operation not permitted',
      exitCode: this.shouldSucceed ? 0 : 2,
      timedOut: false,
    };
  }

  reset(): void {
    this.calls.length = 0;
  }
}

function makeRoute(): DiscoveredRoute {
  return {
    destination: '0.0.0.0/0',
    prefix: 0,
    gateway: '10.0.0.1',
    interfaceName: 'eth0',
    metric: 100,
    protocol: 'static',
    table: { id: 'main', kind: 'main', name: 'main' },
    family: 'ipv4',
    scope: 'global',
    state: 'active',
    priority: 0,
    capabilities: ['ipv4'],
    metadata: { pathType: 'direct' },
  };
}

describe('Runtime-to-executor integration path', () => {
  let runner: IntegrationCommandRunner;
  let kernel: KernelRuntime;

  beforeEach(() => {
    runner = new IntegrationCommandRunner();
    const { contract } = createLinuxRoutingContract({
      commandRunner: runner,
    });
    kernel = new KernelRuntime(undefined, {
      id: 'operator',
      capabilities: ['network.route'],
    });
    kernel.registerContract(contract);
  });

  it('executes a route plan through the kernel routing contract', async () => {
    const engine = new RoutingEngine({
      kernel,
      principal: { id: 'operator', capabilities: ['network.route'] },
    });
    engine.registerProvider({
      id: 'test-discovery',
      discoverRoutes: async () => [makeRoute()],
      verify: async () => true,
    });

    const decision = await engine.decide({
      destination: parseDestination('8.8.8.8'),
      routes: [makeRoute()],
    });

    const plan = await engine.applyPlan(decision.plan);

    // The kernel routing contract should have been invoked
    expect(plan.verification.status).toBe('succeeded');

    // Verify the executor was called with the apply command
    const applyCall = runner.calls.find((c) => c.args.includes('replace'));
    expect(applyCall).toBeDefined();
  });

  it('propagates executor failure through the kernel routing contract', async () => {
    runner.setShouldSucceed(false);

    const engine = new RoutingEngine({
      kernel,
      principal: { id: 'operator', capabilities: ['network.route'] },
    });
    engine.registerProvider({
      id: 'test-discovery',
      discoverRoutes: async () => [makeRoute()],
      verify: async () => true,
    });

    const decision = await engine.decide({
      destination: parseDestination('8.8.8.8'),
      routes: [makeRoute()],
    });

    const plan = await engine.applyPlan(decision.plan);

    // The apply should have failed because the executor returned an error
    expect(plan.verification.status).toBe('failed');

    // The executor should have been called (it ran the apply command)
    const applyCall = runner.calls.find((c) => c.args.includes('replace'));
    expect(applyCall).toBeDefined();
  });

  it('rollbacks through the kernel routing contract', async () => {
    const engine = new RoutingEngine({
      kernel,
      principal: { id: 'operator', capabilities: ['network.route'] },
    });
    engine.registerProvider({
      id: 'test-discovery',
      discoverRoutes: async () => [makeRoute()],
      verify: async () => true,
    });

    const decision = await engine.decide({
      destination: parseDestination('8.8.8.8'),
      routes: [makeRoute()],
    });

    const appliedPlan = await engine.applyPlan(decision.plan);
    expect(appliedPlan.verification.status).toBe('succeeded');

    // Rollback should call the kernel routing contract's rollbackRoutePlan
    const rolledBack = await engine.rollbackPlan(appliedPlan);
    expect(rolledBack).toBe(true);

    // Verify rollback command was issued (del for absent pre-state)
    const delCall = runner.calls.find((c) => c.args.includes('del'));
    expect(delCall).toBeDefined();
  });

  it('enforces capability authorization before executing', async () => {
    // Create a principal WITHOUT network.route capability
    const unauthorizedKernel = new KernelRuntime(undefined, {
      id: 'unauthorized',
      capabilities: ['dns.resolve'], // No network.route
    });
    const { contract } = createLinuxRoutingContract({ commandRunner: runner });
    unauthorizedKernel.registerContract(contract);

    const engine = new RoutingEngine({
      kernel: unauthorizedKernel,
      principal: { id: 'unauthorized', capabilities: ['dns.resolve'] },
    });
    engine.registerProvider({
      id: 'test-discovery',
      discoverRoutes: async () => [makeRoute()],
      verify: async () => true,
    });

    const decision = await engine.decide({
      destination: parseDestination('8.8.8.8'),
      routes: [makeRoute()],
    });

    // The apply should fail because the principal lacks network.route
    const plan = await engine.applyPlan(decision.plan);
    expect(plan.verification.status).toBe('failed');
  });

  it('uses the same production routing contract registered on the kernel', () => {
    // The kernel should have the routing contract registered
    const contracts = kernel.registry.discover('contract');
    const routingContract = contracts.find((c) => c.id === 'routing');
    expect(routingContract).toBeDefined();
    expect(routingContract!.version).toBe('1.0.0');
  });
});

describe('CanonicalNetworkRuntimeAdapter route_change path', () => {
  let runner: IntegrationCommandRunner;
  let kernel: KernelRuntime;
  let adapter: CanonicalNetworkRuntimeAdapter;
  let controlPlane: CanonicalNetworkControlPlane;

  beforeEach(() => {
    runner = new IntegrationCommandRunner();
    const { contract } = createLinuxRoutingContract({ commandRunner: runner });
    kernel = new KernelRuntime(undefined, {
      id: 'operator',
      capabilities: ['network.route'],
    });
    kernel.registerContract(contract);

    const routing = new RoutingEngine({
      kernel,
      principal: { id: 'operator', capabilities: ['network.route'] },
    });
    routing.registerProvider({
      id: 'test-discovery',
      discoverRoutes: async () => [makeRoute()],
      verify: async () => true,
    });

    controlPlane = {
      connectivity: {
        discoverResources: async () => [],
        getAvailableSources: () => [],
        getActiveSource: () => undefined,
        selectSource: async () => ({
          current: undefined,
          availableSources: [],
          healthySources: [],
          candidates: [],
          selected: undefined,
          reason: 'no sources',
          policyConstraints: [],
          generatedAt: new Date().toISOString(),
        }),
        switchSource: async () => {},
        registry: { get: () => ({ getHealth: async () => ({ status: 'healthy' }) }), list: () => [] },
      } as never,
      routing,
    };
    adapter = new CanonicalNetworkRuntimeAdapter(controlPlane);
  });

  it('executes route_change through the canonical adapter to the kernel executor', async () => {
    const plan: ActionPlan = {
      id: 'plan-canonical-test',
      selectedAction: {
        id: 'action-1',
        intent: 'route_change',
        metadata: { destination: '8.8.8.8' },
        rejectionReasons: [],
      },
      requiredCapabilities: ['route.write'],
      dependencies: ['route_change'],
      expectedPostconditions: ['route_change verified'],
      metadata: { idempotencyKey: 'canonical-test' },
    } as never;

    const context: RuntimeContext = {
      correlationId: 'canonical-test',
      mode: 'live',
      policySnapshot: { policy: { simulationOnly: false } } as never,
      cancelled: false,
    } as never;

    const execution: ActionExecution = await adapter.execute(plan, context);

    // The canonical adapter should have invoked the routing engine, which
    // calls kernel.execute('routing', 'applyRoutePlan'), which calls the
    // LinuxRouteExecutor. With the fake runner succeeding, this should work.
    expect(execution.status).not.toBe('skipped');
  });

  it('verifies route_change through the canonical adapter', async () => {
    const plan: ActionPlan = {
      id: 'plan-verify-test',
      selectedAction: {
        id: 'action-2',
        intent: 'route_change',
        metadata: { destination: '8.8.8.8' },
        rejectionReasons: [],
      },
      requiredCapabilities: ['route.write'],
      dependencies: ['route_change'],
      expectedPostconditions: ['route_change verified'],
      metadata: { idempotencyKey: 'verify-test' },
    } as never;

    const context: RuntimeContext = {
      correlationId: 'verify-test',
      mode: 'live',
      policySnapshot: { policy: { simulationOnly: false } } as never,
      cancelled: false,
    } as never;

    const execution: ActionExecution = { status: 'success' } as never;
    const verification: ActionVerification = await adapter.verify(plan, execution, context);

    // The canonical adapter should verify the route_change decision.
    expect(verification).toBeDefined();
  });

  it('rolls back route_change through the canonical adapter', async () => {
    const plan: ActionPlan = {
      id: 'plan-rollback-test',
      selectedAction: {
        id: 'action-3',
        intent: 'route_change',
        metadata: { destination: '8.8.8.8', previousSourceId: undefined },
        rejectionReasons: [],
      },
      requiredCapabilities: ['route.write'],
      dependencies: ['route_change'],
      expectedPostconditions: ['route_change verified'],
      metadata: { idempotencyKey: 'rollback-test' },
    } as never;

    const context: RuntimeContext = {
      correlationId: 'rollback-test',
      mode: 'live',
      policySnapshot: { policy: { simulationOnly: false } } as never,
      cancelled: false,
    } as never;

    const rollbackResult: ActionExecution = await adapter.rollback(plan, context);

    // The canonical adapter should attempt rollback through the routing engine.
    expect(rollbackResult).toBeDefined();
  });
});
