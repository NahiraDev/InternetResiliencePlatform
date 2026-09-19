import { describe, expect, it } from 'vitest';
import { InMemoryEventBus } from '@irp/events';
import { KernelRuntime, createContract } from '@irp/kernel';
import { RoutingEngine, parseDestination, type DiscoveredRoute } from './index.js';

const route = (id: string, pathType: string, destination = '0.0.0.0/0'): DiscoveredRoute => ({
  id,
  destination,
  metric: 10,
  gateway: '10.0.0.1',
  interfaceName: id,
  health: {
    score: 95,
    status: 'healthy',
    latencyMs: 10,
    packetLoss: 0,
    jitterMs: 2,
    stability: 95,
    gatewayReachable: true,
    checkedAt: new Date().toISOString(),
  },
  metadata: { pathType },
});

const runtimeKernel = () => {
  const kernel = new KernelRuntime(undefined, { id: 'operator', capabilities: ['network.route'] });
  kernel.registerContract(
    createContract({
      namespace: 'routing',
      version: '1.0.0',
      operations: {
        applyRoutePlan: { capability: 'network.route', execute: () => ({ ok: true }) },
        rollbackRoutePlan: { capability: 'network.route', execute: () => ({ ok: true }) },
      },
    }),
  );
  return kernel;
};

describe('routing runtime integration guards', () => {
  it('enforces a pre-classified vpn-required destination before scoring', async () => {
    const engine = new RoutingEngine();
    const decision = await engine.simulateRouting({
      destination: {
        ...parseDestination('203.0.113.10'),
        metadata: { routeIntent: 'vpn-required' },
      },
      routes: [route('direct', 'direct'), route('vpn', 'vpn')],
    });

    expect(decision.selected?.path.type).toBe('vpn');
    expect(decision.candidates.find((c) => c.path.type === 'direct')?.rejectionReason).toBe(
      'destination-requires-vpn',
    );
  });

  it('fails closed when live routing has no kernel execution backend', async () => {
    const engine = new RoutingEngine();
    const decision = await engine.decide({
      destination: parseDestination('8.8.8.8'),
      routes: [route('direct', 'direct')],
    });
    const plan = await engine.applyPlan(decision.plan);
    expect(plan.verification.status).toBe('failed');
  });

  it('fails closed when live routing has no verification provider', async () => {
    const engine = new RoutingEngine({
      kernel: runtimeKernel(),
      principal: { id: 'operator', capabilities: ['network.route'] },
    });
    const decision = await engine.decide({
      destination: parseDestination('1.1.1.1'),
      routes: [route('direct', 'direct')],
    });
    const plan = await engine.applyPlan(decision.plan);
    expect(plan.verification.status).toBe('failed');
  });

  it('reports recovery failure when verification prevents route activation', async () => {
    const events = new InMemoryEventBus();
    let failed = false;
    events.subscribe('routing.recovery.failed', () => {
      failed = true;
    });
    const engine = new RoutingEngine({
      kernel: runtimeKernel(),
      principal: { id: 'operator', capabilities: ['network.route'] },
      events,
    });
    engine.registerProvider({
      id: 'rejecting-verifier',
      discoverRoutes: async () => [],
      verify: async () => false,
    });
    const plan = await engine.recover({
      destination: parseDestination('9.9.9.9'),
      routes: [route('direct', 'direct')],
    });
    expect(plan.verification.status).toBe('failed');
    expect(failed).toBe(true);
  });

  it('restores the captured route pre-state through the canonical rollback operation', async () => {
    const applied: string[] = [];
    const kernel = new KernelRuntime(undefined, {
      id: 'operator',
      capabilities: ['network.route'],
    });
    kernel.registerContract(
      createContract({
        namespace: 'routing',
        version: '1.0.0',
        operations: {
          applyRoutePlan: {
            capability: 'network.route',
            execute: (input) => {
              applied.push(`apply:${(input as { id: string }).id}`);
              return { ok: true };
            },
          },
          rollbackRoutePlan: {
            capability: 'network.route',
            execute: (input) => {
              applied.push(`rollback:${(input as { id: string }).id}`);
              return { ok: true };
            },
          },
        },
      }),
    );
    const engine = new RoutingEngine({
      kernel,
      principal: { id: 'operator', capabilities: ['network.route'] },
    });
    engine.registerProvider({
      id: 'verifier',
      discoverRoutes: async () => [route('direct', 'direct')],
      verify: async () => true,
    });
    const decision = await engine.decide(
      {
        destination: parseDestination('8.8.8.8'),
        routes: [route('direct', '0.0.0.0/0')],
      },
      false,
    );
    const appliedPlan = await engine.applyPlan(decision.plan);

    expect(appliedPlan.verification.status).toBe('succeeded');
    expect(await engine.rollbackPlan(appliedPlan)).toBe(true);
    expect(applied).toEqual([`apply:${appliedPlan.id}`, `rollback:${appliedPlan.id}`]);
  });
});
