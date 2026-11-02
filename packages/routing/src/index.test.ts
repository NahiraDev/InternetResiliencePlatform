import { describe, expect, it, vi } from 'vitest';
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
  it('projects destination paths into a queryable graph with correlated failure domains', async () => {
    const engine = new RoutingEngine();
    const decision = await engine.simulateRouting({
      destination: parseDestination('8.8.8.8'),
      routes: [
        route('isp-a-gateway-a', '0.0.0.0/0', 10, 95, {
          source: 'isp-a:link-a',
          gateway: '10.0.0.1',
          metadata: { pathType: 'direct', failureDomains: ['provider:isp-a', 'region:r1'] },
        }),
        route('isp-a-gateway-b', '0.0.0.0/0', 20, 90, {
          source: 'isp-a:link-b',
          gateway: '10.0.0.2',
          metadata: { pathType: 'direct', failureDomains: ['provider:isp-a', 'region:r1'] },
        }),
        route('isp-b', '0.0.0.0/0', 30, 80, {
          source: 'isp-b:link-a',
          gateway: '10.1.0.1',
          metadata: { pathType: 'tunnel', failureDomains: ['provider:isp-b', 'region:r2'] },
        }),
      ],
    });

    expect(decision.graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'destination:ip:8.8.8.8', kind: 'destination' }),
        expect.objectContaining({ id: 'provider:isp-a', kind: 'provider' }),
      ]),
    );
    expect(decision.graph.pathsFor(parseDestination('8.8.8.8'))).toHaveLength(3);
    expect(decision.graph.usablePaths(parseDestination('8.8.8.8'))).toHaveLength(3);
    expect(
      decision.graph.independentAlternatives('path:isp-a-gateway-a', parseDestination('8.8.8.8')),
    ).toEqual([expect.objectContaining({ id: 'path:isp-b' })]);
    expect(decision.graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'path:path:isp-a-gateway-a', kind: 'reaches' }),
      ]),
    );
  });

  it('selects a single eligible route in simulation mode without kernel calls', async () => {
    const kernel = new KernelRuntime();
    const execute = vi.spyOn(kernel, 'execute');
    const engine = new RoutingEngine({ kernel });
    const decision = await engine.simulateRouting({
      destination: parseDestination('8.8.8.8'),
      routes: [route('eth', '0.0.0.0/0', 10, 95)],
    });
    expect(decision.selected?.route.id).toBe('eth');
    expect(decision.plan.dryRun).toBe(true);
    expect(decision.plan.explanation.eligibleCandidateIds).toHaveLength(1);
    expect(execute).not.toHaveBeenCalled();
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

  describe('transition integrity after the kernel has applied a route', () => {
    const kernelWith = (log: string[], extra: Record<string, { capability: string; execute: (i: RoutePlan) => unknown }> = {}) => {
      const kernel = new KernelRuntime(undefined, { id: 'operator', capabilities: ['network.route'] });
      kernel.registerContract(
        createContract({
          namespace: 'routing',
          version: '1.0.0',
          operations: {
            applyRoutePlan: {
              capability: 'network.route',
              execute: (input: RoutePlan) => {
                log.push(`apply:${input.id}`);
                return { ok: true };
              },
            },
            rollbackRoutePlan: {
              capability: 'network.route',
              execute: (input: RoutePlan) => {
                log.push(`rollback:${input.id}`);
                return { ok: true };
              },
            },
            ...extra,
          },
        }),
      );
      return kernel;
    };
    const engineFor = (kernel: KernelRuntime) =>
      new RoutingEngine({ kernel, principal: { id: 'operator', capabilities: ['network.route'] } });

    it('calls a class-based verifier with its own `this` instead of throwing on a detached method', async () => {
      class StatefulVerifier {
        readonly id = 'stateful';
        private readonly accepted = true;
        async discoverRoutes() {
          return [];
        }
        async verify(): Promise<boolean> {
          // Reads instance state: a detached call throws "Cannot read properties of undefined".
          return this.accepted;
        }
      }
      const log: string[] = [];
      const engine = engineFor(kernelWith(log));
      engine.registerProvider(new StaticRouteDiscoveryProvider('static', [route('eth', '0.0.0.0/0')]));
      engine.registerProvider(new StatefulVerifier());
      const decision = await engine.decide({ destination: parseDestination('8.8.8.8') });
      const plan = await engine.applyPlan(decision.plan);
      expect(plan.verification.status).toBe('succeeded');
      expect(log).toEqual([`apply:${plan.id}`]);
    });

    it('rolls back a route the kernel already applied when verification throws', async () => {
      const log: string[] = [];
      const engine = engineFor(kernelWith(log));
      engine.registerProvider(new StaticRouteDiscoveryProvider('static', [route('eth', '0.0.0.0/0')]));
      engine.registerProvider({
        id: 'throwing-verifier',
        discoverRoutes: async () => [],
        verify: async () => {
          throw new Error('probe crashed');
        },
      });
      const decision = await engine.decide({ destination: parseDestination('8.8.8.8') });
      const plan = await engine.applyPlan(decision.plan);
      expect(plan.verification.status).toBe('failed');
      expect(log).toEqual([`apply:${plan.id}`, `rollback:${plan.id}`]);
    });

    it('does not attempt a rollback when the kernel never applied the route', async () => {
      const log: string[] = [];
      const kernel = new KernelRuntime(undefined, { id: 'operator', capabilities: ['network.route'] });
      kernel.registerContract(
        createContract({
          namespace: 'routing',
          version: '1.0.0',
          operations: {
            applyRoutePlan: {
              capability: 'network.route',
              execute: (input: RoutePlan) => {
                log.push(`apply:${input.id}`);
                throw new Error('ip refused');
              },
            },
            rollbackRoutePlan: {
              capability: 'network.route',
              execute: (input: RoutePlan) => {
                log.push(`rollback:${input.id}`);
                return { ok: true };
              },
            },
          },
        }),
      );
      const engine = engineFor(kernel);
      engine.registerProvider(new StaticRouteDiscoveryProvider('static', [route('eth', '0.0.0.0/0')]));
      engine.registerProvider({ id: 'v', discoverRoutes: async () => [], verify: async () => true });
      const decision = await engine.decide({ destination: parseDestination('8.8.8.8') });
      const plan = await engine.applyPlan(decision.plan);
      expect(plan.verification.status).toBe('failed');
      // The kernel bus retries a failing operation; what matters is that nothing is rolled back,
      // because nothing was ever applied.
      expect(log.length).toBeGreaterThan(0);
      expect(log.every((entry) => entry === `apply:${plan.id}`)).toBe(true);
    });

    it('proves a rollback only from a provider that can observe it, and fails closed otherwise', async () => {
      const engine = engineFor(kernelWith([]));
      const plan = (await engine.decide({ destination: parseDestination('8.8.8.8'), routes: [route('eth', '0.0.0.0/0')] })).plan;
      expect(await engine.verifyRollback(plan)).toBe(false); // nobody can observe it

      engine.registerProvider({ id: 'yes', discoverRoutes: async () => [], verifyRolledBack: async () => true });
      expect(await engine.verifyRollback(plan)).toBe(true);

      engine.registerProvider({ id: 'no', discoverRoutes: async () => [], verifyRolledBack: async () => false });
      expect(await engine.verifyRollback(plan)).toBe(false); // any dissent means unproven

      const thrown = engineFor(kernelWith([]));
      thrown.registerProvider({
        id: 'broken',
        discoverRoutes: async () => [],
        verifyRolledBack: async () => {
          throw new Error('cannot read routing table');
        },
      });
      expect(await thrown.verifyRollback(plan)).toBe(false);
    });

    it('confirms a plan through the kernel, and reports false instead of throwing when it cannot', async () => {
      const confirmed: string[] = [];
      const withConfirm = engineFor(
        kernelWith([], {
          confirmRoutePlan: {
            capability: 'network.route',
            execute: (input: RoutePlan) => {
              confirmed.push(input.id);
              return { ok: true };
            },
          },
        }),
      );
      const plan = (await withConfirm.decide({ destination: parseDestination('8.8.8.8'), routes: [route('eth', '0.0.0.0/0')] })).plan;
      expect(await withConfirm.confirmPlan(plan)).toBe(true);
      expect(confirmed).toEqual([plan.id]);

      // A kernel whose routing contract has no confirm operation, and an engine with no kernel.
      expect(await engineFor(kernelWith([])).confirmPlan(plan)).toBe(false);
      expect(await new RoutingEngine().confirmPlan(plan)).toBe(false);
    });
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
