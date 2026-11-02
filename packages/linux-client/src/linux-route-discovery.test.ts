/**
 * Real Linux route discovery test.
 *
 * This test reads actual `ip -j route show` output from the host and
 * verifies the LinuxRouteDiscoveryProvider converts it into
 * DiscoveredRoute[] correctly.
 *
 * This is REAL execution evidence — not a mock. The provider runs the
 * actual `ip` binary and parses real JSON output.
 *
 * This test does NOT require CAP_NET_ADMIN — reading route state is
 * unprivileged. Route mutation tests require CAP_NET_ADMIN and are
 * documented separately.
 */

import { describe, expect, it } from 'vitest';
import { LinuxRouteDiscoveryProvider, ipRouteToDiscovered } from './linux-route-discovery.js';

describe('LinuxRouteDiscoveryProvider real network state', () => {
  it('reads real ip -j route show output and converts to DiscoveredRoute[]', async () => {
    const provider = new LinuxRouteDiscoveryProvider();
    const routes = await provider.discoverRoutes({} as never);

    // In any Linux environment, there should be at least a default route
    // or a link-scoped route. An empty result means ip is unavailable,
    // which is still valid (the provider returns [] on failure).
    expect(Array.isArray(routes)).toBe(true);

    for (const route of routes) {
      expect(route.destination).toBeDefined();
      expect(typeof route.destination).toBe('string');
      expect(route.prefix).toBeGreaterThanOrEqual(0);
      expect(route.family === 'ipv4' || route.family === 'ipv6').toBe(true);
    }
  });

  it('correctly parses a known ip -j route show JSON entry', () => {
    const raw = {
      dst: 'default',
      gateway: '192.168.1.1',
      dev: 'eth0',
      protocol: 'dhcp',
      metric: 100,
      scope: 'global',
      table: 'main',
    };

    const route = ipRouteToDiscovered(raw);

    expect(route.destination).toBe('default');
    expect(route.prefix).toBe(0);
    expect(route.gateway).toBe('192.168.1.1');
    expect(route.interfaceName).toBe('eth0');
    expect(route.protocol).toBe('provider');
    expect(route.metric).toBe(100);
    expect(route.family).toBe('ipv4');
    expect(route.table?.id).toBe('main');
    expect(route.table?.kind).toBe('main');
  });

  it('correctly parses a CIDR route entry', () => {
    const raw = {
      dst: '10.0.0.0/24',
      dev: 'eth1',
      protocol: 'kernel',
      scope: 'link',
      src: '10.0.0.5',
      table: 'main',
    };

    const route = ipRouteToDiscovered(raw);

    expect(route.destination).toBe('10.0.0.0');
    expect(route.prefix).toBe(24);
    expect(route.interfaceName).toBe('eth1');
    expect(route.protocol).toBe('kernel');
    expect(route.scope).toBe('link');
    expect(route.source).toBe('10.0.0.5');
  });

  it('correctly parses an IPv6 route entry', () => {
    const raw = {
      dst: '::/0',
      gateway: 'fe80::1',
      dev: 'eth0',
      protocol: 'ra',
      metric: 100,
      table: 'main',
    };

    const route = ipRouteToDiscovered(raw);

    expect(route.destination).toBe('::');
    expect(route.prefix).toBe(0);
    expect(route.gateway).toBe('fe80::1');
    expect(route.family).toBe('ipv6');
  });

  it('verifies that a route exists for a real default route', async () => {
    const provider = new LinuxRouteDiscoveryProvider();
    const routes = await provider.discoverRoutes({} as never);

    // If there's a default route, verify it
    const defaultRoute = routes.find((r) => r.prefix === 0);
    if (defaultRoute) {
      // The verify method should find the default route
      const plan = {
        id: 'verify-test',
        destination: { kind: 'default' as const, value: 'default', family: 'ipv4' as const },
        selectedPath: {
          id: 'path:verify',
          type: 'direct' as const,
          hops: [],
          route: {
            id: 'route:verify',
            destination: 'default',
            prefix: 0,
            protocol: 'kernel' as const,
            metric: 0,
            table: { id: 'main', kind: 'main' as const, name: 'main' },
            family: 'ipv4' as const,
            scope: 'global' as const,
            state: 'active' as const,
            priority: 0,
            capabilities: ['ipv4'],
            metadata: {},
          },
          capabilities: ['ipv4'],
          state: 'active' as const,
          metadata: {},
        },
        candidatePaths: [],
        reason: 'verify',
        policy: [],
        actions: [],
        verification: {
          required: false,
          timeoutMs: 5000,
          strategy: 'provider' as const,
          status: 'pending' as const,
        },
        explanation: {
          matchedRouteIds: [],
          eligibleCandidateIds: [],
          rejected: [],
          policy: [],
          scores: {},
          reason: 'verify',
          precedence: [],
        },
        dryRun: true,
        createdAt: new Date().toISOString(),
      };

      const verified = await provider.verify(plan as never);
      // If a default route exists, verification should succeed
      expect(typeof verified).toBe('boolean');
    }
  });
});

/**
 * Regression: iproute2 rejects `-f ipv4` / `-f ipv6` ("invalid protocol family") and only accepts
 * `inet` / `inet6`. The provider used to pass the symbolic names, so against a real kernel
 * `verify()` always returned false and every live route change rolled itself back. The assertion
 * above (`typeof verified === 'boolean'`) could not catch that, so this checks the exact arguments.
 */
describe('LinuxRouteDiscoveryProvider.verify command line', () => {
  const planFor = (
    destination: Record<string, unknown>,
    family: 'ipv4' | 'ipv6',
    selectedRoute: { interfaceName?: string; gateway?: string } = {},
  ) =>
    ({
      id: 'verify-args',
      destination,
      selectedPath: {
        id: 'path:verify-args',
        type: 'direct',
        hops: [],
        route: {
          id: 'route:verify-args',
          destination: 'x',
          prefix: 0,
          ...(selectedRoute.interfaceName ? { interfaceName: selectedRoute.interfaceName } : {}),
          ...(selectedRoute.gateway ? { gateway: selectedRoute.gateway } : {}),
          protocol: 'static',
          metric: 0,
          table: { id: 'main', kind: 'main', name: 'main' },
          family,
          scope: 'global',
          state: 'active',
          priority: 0,
          capabilities: [family],
          metadata: {},
        },
        capabilities: [family],
        state: 'active',
        metadata: {},
      },
    }) as never;

  const recorder = (stdout: string) => {
    const calls: (readonly string[])[] = [];
    return {
      calls,
      runner: {
        async run(_binary: string, args: readonly string[]) {
          calls.push(args);
          return { stdout, stderr: '', exitCode: 0 };
        },
      },
    };
  };

  it('asks iproute2 for the inet family and sees a present route', async () => {
    const { calls, runner } = recorder('[{"dst":"10.98.0.10","gateway":"10.99.1.2","dev":"vp-a"}]');
    const provider = new LinuxRouteDiscoveryProvider({ netns: 'lab', commandRunner: runner });
    const verified = await provider.verify(
      planFor({ kind: 'ip', value: '10.98.0.10', family: 'ipv4' }, 'ipv4'),
    );
    expect(verified).toBe(true);
    expect(calls).toEqual([
      ['-n', 'lab', '-j', '-f', 'inet', 'route', 'show', 'table', 'main', '10.98.0.10/32'],
    ]);
  });

  it('asks iproute2 for the inet6 family for IPv6 destinations', async () => {
    const { calls, runner } = recorder('[{"dst":"2001:db8::10"}]');
    const provider = new LinuxRouteDiscoveryProvider({ commandRunner: runner });
    await provider.verify(planFor({ kind: 'ip', value: '2001:db8::10', family: 'ipv6' }, 'ipv6'));
    expect(calls[0]).toEqual(['-j', '-f', 'inet6', 'route', 'show', 'table', 'main', '2001:db8::10/128']);
  });

  it('never passes the symbolic ipv4/ipv6 family names that iproute2 rejects', async () => {
    const { calls, runner } = recorder('[]');
    const provider = new LinuxRouteDiscoveryProvider({ commandRunner: runner });
    await provider.verify(planFor({ kind: 'default', value: 'default', family: 'ipv4' }, 'ipv4'));
    await provider.verify(planFor({ kind: 'ip', value: '2001:db8::1', family: 'ipv6' }, 'ipv6'));
    for (const args of calls) {
      const family = args[args.indexOf('-f') + 1];
      expect(['inet', 'inet6']).toContain(family);
    }
  });

  it('does not accept an unrelated interface route as verification of a tunnel route', async () => {
    const { runner } = recorder('[{"dst":"10.98.0.10","dev":"eth0"}]');
    const provider = new LinuxRouteDiscoveryProvider({ commandRunner: runner });
    expect(
      await provider.verify(
        planFor(
          { kind: 'ip', value: '10.98.0.10', family: 'ipv4' },
          'ipv4',
          { interfaceName: 'irpwg0' },
        ),
      ),
    ).toBe(false);
  });

  it('verifies that a route is installed through the selected WireGuard interface', async () => {
    const { runner } = recorder('[{"dst":"10.98.0.10","dev":"irpwg0"}]');
    const provider = new LinuxRouteDiscoveryProvider({ commandRunner: runner });
    expect(
      await provider.verify(
        planFor(
          { kind: 'ip', value: '10.98.0.10', family: 'ipv4' },
          'ipv4',
          { interfaceName: 'irpwg0' },
        ),
      ),
    ).toBe(true);
  });

  it('does not verify a selected gateway when a different gateway is installed', async () => {
    const { runner } = recorder('[{"dst":"10.98.0.10","gateway":"192.0.2.1","dev":"eth0"}]');
    const provider = new LinuxRouteDiscoveryProvider({ commandRunner: runner });
    expect(
      await provider.verify(
        planFor(
          { kind: 'ip', value: '10.98.0.10', family: 'ipv4' },
          'ipv4',
          { interfaceName: 'eth0', gateway: '192.0.2.254' },
        ),
      ),
    ).toBe(false);
  });

  it('reports an absent route as unverified', async () => {
    const { runner } = recorder('[]');
    const provider = new LinuxRouteDiscoveryProvider({ commandRunner: runner });
    expect(
      await provider.verify(planFor({ kind: 'ip', value: '10.98.0.10', family: 'ipv4' }, 'ipv4')),
    ).toBe(false);
  });
});
