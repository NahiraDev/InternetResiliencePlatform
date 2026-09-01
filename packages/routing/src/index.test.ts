import { describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus } from '@irp/events';
import { KernelRuntime, createContract } from '@irp/kernel';
import {
  RoutingEngine,
  StaticRouteDiscoveryProvider,
  longestPrefix,
  normalizeRoute,
  parseDestination,
  routeMatchesDestination,
  type DiscoveredRoute,
  type RoutePlan,
} from './index.js';

const route = (
  id: string,
  destination: string,
  metric = 100,
  health = 90,
  extra: Partial<DiscoveredRoute> = {},
): DiscoveredRoute => ({
  id,
  destination,
  metric,
  gateway: '10.0.0.1',
  interfaceName: id,
  source: `p:${id}`,
  health: {
    score: health,
    status: health < 40 ? 'unhealthy' : 'healthy',
    latencyMs: metric,
    packetLoss: 0,
    jitterMs: 5,
    stability: 90,
    gatewayReachable: true,
  },
  capabilities: ['tcp'],
  ...extra,
});

describe('route normalization and destination matching', () => {
  it('normalizes route table, prefix, family, health, and capabilities', () => {
    const r = normalizeRoute(route('r1', '10.10.0.0/16'));
    expect(r.table.kind).toBe('main');
    expect(r.prefix).toBe(16);
    expect(r.family).toBe('ipv4');
    expect(r.capabilities).toContain('ipv4');
  });

  it('implements IPv4 and IPv6 CIDR and longest-prefix semantics', () => {
    const routes = [
      normalizeRoute(route('default', '0.0.0.0/0')),
      normalizeRoute(route('ten', '10.0.0.0/8')),
      normalizeRoute(route('specific', '10.10.20.0/24')),
    ];
    expect(routeMatchesDestination(routes[2]!, parseDestination('10.10.20.50'))).toBe(true);
    expect(longestPrefix(routes, parseDestination('10.10.20.50')).map((r) => r.id)).toEqual([
      'specific',
    ]);
    expect(
      routeMatchesDestination(
        normalizeRoute(route('v6', '2001:db8::/32')),
        parseDestination('2001:db8::1'),
      ),
    ).toBe(true);
  });
});

describe('routing engine decisions', () => {
  it('selects a single eligible route and emits explanation events in simulation mode without kernel calls', async () => {
    const kernel = new KernelRuntime();
    const execute = vi.spyOn(kernel, 'execute');
    const events = new InMemoryEventBus();
    const observed: string[] = [];
    events.subscribe('routing.decision.created', (e) => {
      observed.push(e.type);
    });
    const engine = new RoutingEngine({ kernel, events });
    const decision = await engine.simulateRouting({
      destination: parseDestination('8.8.8.8'),
      routes: [route('eth', '0.0.0.0/0', 10, 95)],
    });
    expect(decision.selected?.route.id).toBe('eth');
    expect(decision.plan.dryRun).toBe(true);
    expect(decision.plan.explanation.eligibleCandidateIds).toHaveLength(1);
    expect(execute).not.toHaveBeenCalled();
    expect(observed).toContain('routing.decision.created');
  });

  it('rejects unhealthy and policy-denied candidates before scoring', async () => {
    const engine = new RoutingEngine();
    engine.registerPolicy({
      evaluate: ({ route }) => ({
        allowed: route.id !== 'wifi',
        reason: 'blocked by routing policy',
      }),
    });
    const decision = await engine.simulateRouting({
      destination: parseDestination('1.1.1.1'),
      routes: [
        route('bad', '0.0.0.0/0', 1, 10),
        route('wifi', '0.0.0.0/0', 5, 90),
        route('eth', '0.0.0.0/0', 50, 92),
      ],
    });
    expect(decision.selected?.route.id).toBe('eth');
    expect(
      decision.candidates.filter((c) => c.eligibility === 'rejected').map((c) => c.rejectionReason),
    ).toEqual(expect.arrayContaining(['route-unhealthy', 'policy-prohibited']));
  });

  it('prefers longest-prefix candidates before a better default route', async () => {
    const engine = new RoutingEngine();
    const decision = await engine.simulateRouting({
      destination: parseDestination('10.10.20.50'),
      routes: [
        route('default-fast', '0.0.0.0/0', 1, 99),
        route('specific-slower', '10.10.20.0/24', 900, 70),
      ],
    });
    expect(decision.selected?.route.id).toBe('specific-slower');
  });

  it('applies manual overrides deterministically', async () => {
    const engine = new RoutingEngine();
    const ctx = engine.setManualOverride(
      {
        destination: parseDestination('8.8.4.4'),
        routes: [route('eth', '0.0.0.0/0'), route('wifi', '0.0.0.0/0')],
      },
      { mode: 'require-path', target: 'path:wifi', reason: 'operator maintenance' },
    );
    const decision = await engine.simulateRouting(ctx);
    expect(decision.selected?.path.id).toBe('path:wifi');
    expect(decision.candidates.find((c) => c.route.id === 'eth')?.rejectionReason).toBe(
      'manual-override',
    );
  });

  it('represents VPN and proxy-like abstract paths without executing them directly', async () => {
    const engine = new RoutingEngine();
    const decision = await engine.simulateRouting({
      destination: parseDestination('203.0.113.1'),
      routes: [
        route('vpn', '203.0.113.0/24', 20, 93, { metadata: { pathType: 'vpn' } }),
        route('proxy', '203.0.113.0/24', 30, 91, { metadata: { pathType: 'proxy' } }),
      ],
    });
    expect(decision.plan.candidatePaths.map((p) => p.type)).toEqual(
      expect.arrayContaining(['vpn', 'proxy']),
    );
  });

  it('uses the kernel routing capability and rolls back when verification fails', async () => {
    const kernel = new KernelRuntime(undefined, {
      id: 'operator',
      capabilities: ['network.route'],
    });
    const applied: string[] = [];
    kernel.registerContract(
      createContract({
        namespace: 'routing',
        version: '1.0.0',
        operations: {
          applyRoutePlan: {
            capability: 'network.route',
            execute: (input: RoutePlan) => {
              applied.push(`apply:${input.id}`);
              return { ok: true };
            },
          },
          rollbackRoutePlan: {
            capability: 'network.route',
            execute: (input: RoutePlan) => {
              applied.push(`rollback:${input.id}`);
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
    engine.registerProvider(
      new StaticRouteDiscoveryProvider('static', [route('eth', '0.0.0.0/0')]),
    );
    engine.registerProvider({
      id: 'verifier',
      discoverRoutes: async () => [],
      verify: async () => false,
    });
    const decision = await engine.decide({ destination: parseDestination('8.8.8.8') });
    const plan = await engine.applyPlan(decision.plan);
    expect(plan.verification.status).toBe('failed');
    expect(applied).toEqual([`apply:${plan.id}`, `rollback:${plan.id}`]);
  });

  it('does not report a live route application as successful without a kernel runtime', async () => {
    const engine = new RoutingEngine();
    const decision = await engine.decide({
      destination: parseDestination('8.8.8.8'),
      routes: [route('eth', '0.0.0.0/0')],
    });
    const plan = await engine.applyPlan(decision.plan);
    expect(plan.verification.status).toBe('failed');
  });

  it('does not report failover or recovery as successful when no path is executable', async () => {
    const engine = new RoutingEngine();
    const failover = await engine.failover({
      destination: parseDestination('8.8.8.8'),
      routes: [route('bad', '0.0.0.0/0', 1, 10)],
    });
    const recovery = await engine.recover({
      destination: parseDestination('8.8.8.8'),
      routes: [route('bad', '0.0.0.0/0', 1, 10)],
    });
    expect(failover.selectedPath).toBeUndefined();
    expect(recovery.selectedPath).toBeUndefined();
  });

  it('is idempotent for concurrent route change requests', async () => {
    const kernel = new KernelRuntime(undefined, {
      id: 'operator',
      capabilities: ['network.route'],
    });
    let calls = 0;
    kernel.registerContract(
      createContract({
        namespace: 'routing',
        version: '1.0.0',
        operations: {
          applyRoutePlan: {
            capability: 'network.route',
            execute: async () => {
              calls += 1;
              await new Promise((resolve) => setTimeout(resolve, 10));
              return { ok: true };
            },
          },
          rollbackRoutePlan: { capability: 'network.route', execute: () => ({ ok: true }) },
        },
      }),
    );
    const engine = new RoutingEngine({
      kernel,
      principal: { id: 'operator', capabilities: ['network.route'] },
    });
    const decision = await engine.decide({
      destination: parseDestination('9.9.9.9'),
      routes: [route('eth', '0.0.0.0/0')],
    });
    await Promise.all([engine.applyPlan(decision.plan), engine.applyPlan(decision.plan)]);
    expect(calls).toBe(1);
  });
});
