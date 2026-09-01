import { describe, expect, it } from 'vitest';
import { RoutingEngine, parseDestination, type DiscoveredRoute, type RoutePlan } from './index.js';
import { KernelRuntime, createContract } from '@irp/kernel';

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
    const engine = new RoutingEngine({ kernel: runtimeKernel(), principal: { id: 'operator', capabilities: ['network.route'] } });
    const decision = await engine.decide({
      destination: parseDestination('1.1.1.1'),
      routes: [route('direct', 'direct')],
    });
    const plan = await engine.applyPlan(decision.plan);
    expect(plan.verification.status).toBe('failed');
  });

  it('does not report recovery success when route application fails', async () => {
    const kernel = runtimeKernel();
    const engine = new RoutingEngine({ kernel, principal: { id: 'operator', capabilities: ['network.route'] } });
    const decision = await engine.decide({
      destination: parseDestination('9.9.9.9'),
      routes: [route('direct', 'direct')],
    });
    const failedPlan: RoutePlan = { ...decision.plan, verification: { ...decision.plan.verification, status: 'failed' } };
    expect(failedPlan.verification.status).toBe('failed');
  });
});
