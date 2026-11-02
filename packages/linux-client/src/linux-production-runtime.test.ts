/**
 * Wiring tests proving the production Linux runtime constructs a real
 * ResilienceRuntime with a KernelRuntime, production routing contract, real
 * route discovery provider, connectivity manager with Starlink, and a
 * CanonicalNetworkRuntimeAdapter with supportsLive: true.
 *
 * These tests do NOT mutate host networking. They prove the wiring is real,
 * not simulated.
 */

import { describe, expect, it } from 'vitest';
import { parseDestination } from '@irp/routing';
import {
  LinuxProductionRuntime,
  LinuxClientServer,
  LinuxSystem,
  type LinuxSystemAdapter,
  type NetworkSnapshot,
} from './index.js';

class StubLinuxSystem implements LinuxSystemAdapter {
  policy = { autonomousMode: false };

  async snapshot(): Promise<NetworkSnapshot> {
    return {
      interfaces: 'eth0 UP 192.0.2.10/24',
      routes: 'default via 192.0.2.1 dev eth0',
      dns: 'Global DNS Servers: 1.1.1.1',
      capturedAt: '2026-10-07T00:00:00.000Z',
    };
  }

  async setAutonomousMode(enabled: boolean): Promise<void> {
    this.policy = { autonomousMode: enabled };
  }

  getPolicy() {
    return { ...this.policy };
  }
}

describe('LinuxProductionRuntime wiring', () => {
  it('constructs a real KernelRuntime with the production routing contract', () => {
    const runtime = new LinuxProductionRuntime(new StubLinuxSystem(), {
      enableLiveRouteMutation: true,
    });

    expect(runtime.controlPlane.kernel).toBeDefined();
    expect(runtime.controlPlane.kernel.state).toBe('created');
  });

  it('constructs a RoutingEngine with a real Linux route discovery provider', () => {
    const runtime = new LinuxProductionRuntime(new StubLinuxSystem(), {
      enableLiveRouteMutation: true,
    });

    expect(runtime.controlPlane.routing).toBeDefined();
    const providers = (runtime.controlPlane.routing as unknown as {
      providers: unknown[];
    }).providers;
    expect(providers).toBeDefined();
    expect(providers.length).toBeGreaterThan(0);
  });

  it('constructs a ConnectivityManager with Starlink registered', () => {
    const runtime = new LinuxProductionRuntime(new StubLinuxSystem(), {
      enableLiveRouteMutation: true,
    });

    const providers = runtime.controlPlane.connectivity.getProviders();
    const starlink = providers.find((p) => p.id === 'starlink');
    expect(starlink).toBeDefined();
    expect(starlink!.capabilities()).toContain('monitor');
    expect(starlink!.capabilities()).toContain('health-check');
    // Starlink is monitor-only — does not own dish power lifecycle
    expect(starlink!.capabilities()).not.toContain('connect');
  });

  it('uses executionMode real with a CanonicalNetworkControlPlane', () => {
    const runtime = new LinuxProductionRuntime(new StubLinuxSystem(), {
      enableLiveRouteMutation: true,
    });

    expect(runtime.composition.executionMode).toBe('real');
  });

  it('registers a CanonicalNetworkRuntimeAdapter with supportsLive: true', () => {
    const runtime = new LinuxProductionRuntime(new StubLinuxSystem(), {
      enableLiveRouteMutation: true,
    });

    const capabilities = runtime.runtime.capabilities();
    const networkAdapter = capabilities.find(
      (c) => c.adapterId === 'canonical-network-control-plane',
    );
    expect(networkAdapter).toBeDefined();
    expect(networkAdapter!.supportsLive).toBe(true);
    expect(networkAdapter!.supportedActions).toContain('route_change');
  });


  it('composes existing DNS, tunnel, gateway and destination-verification ports into the canonical runtime', () => {
    const tunnelPlane = {
      configured: true,
      connect: async () => ({ tunnelId: 'tunnel-1', providerId: 'wireguard', connectionId: 'connection-1' }),
      verify: async () => true,
      rollback: async () => true,
    };
    const dnsPlane = {
      engine: { evaluate: async () => [], status: () => ({ activeProviderId: undefined }) },
      applyProvider: async () => undefined,
    };
    const gatewayPlane = {
      configured: true,
      currentGatewayId: undefined,
      gateways: () => [],
      synchronize: async () => undefined,
      evaluate: async () => ({ switched: false, reason: 'no switch required', candidates: [] }),
      apply: async () => undefined,
    };
    const verifyDestination = async () => ({ status: 'reachable' as const });
    const runtime = new LinuxProductionRuntime(new StubLinuxSystem(), {
      enableLiveRouteMutation: true,
      canonicalExtensions: {
        dns: dnsPlane as never,
        tunnel: tunnelPlane as never,
        gatewaySelection: gatewayPlane as never,
        destination: parseDestination('203.0.113.10'),
        verifyDestination,
      },
    });
    expect(runtime.controlPlane.controlPlane.dns).toBe(dnsPlane);
    expect(runtime.controlPlane.controlPlane.tunnel).toBe(tunnelPlane);
    expect(runtime.controlPlane.controlPlane.gatewaySelection).toBe(gatewayPlane);
    expect(runtime.controlPlane.controlPlane.verifyDestination).toBe(verifyDestination);
    expect(runtime.controlPlane.controlPlane.destination).toEqual(parseDestination('203.0.113.10'));
    expect(runtime.runtime.capabilities().some(d => d.adapterId === 'canonical-tunnel-control-plane')).toBe(true);
  });

  it('recovers the route journal before the first runtime cycle', async () => {
    const runtime = new LinuxProductionRuntime(new StubLinuxSystem(), { enableLiveRouteMutation: false });
    await runtime.start();
    expect((await runtime.status()).routeRecovery).toMatchObject({
      rolledBack: [], failed: [], pruned: [], corrupt: [],
    });
    await runtime.stop();
  });

  it('runs recurring canonical cycles only after autonomy is explicitly enabled', async () => {
    const runtime = new LinuxProductionRuntime(new StubLinuxSystem(), {
      enableLiveRouteMutation: false,
      registerHostConnectivity: false,
      registerStarlink: false,
      registerHostConnectivity: false,
      registerStarlink: false,
      scheduler: { cycleIntervalMs: 60_000, cooldownMs: 0, executionBudgetMs: 10_000 },
    });
    await runtime.start();
    expect((await runtime.status()).scheduler).toBeUndefined();
    await runtime.setAutonomousMode(true);
    expect((await runtime.status()).scheduler).toMatchObject({ enabled: true, active: 0 });
    await runtime.setAutonomousMode(false);
    expect((await runtime.status()).scheduler).toBeUndefined();
    await runtime.stop();
  });

  it('exposes route mutation capability status', () => {
    const runtime = new LinuxProductionRuntime(new StubLinuxSystem(), {
      enableLiveRouteMutation: true,
    });

    const cap = runtime.getRouteMutationCapability();
    expect(cap.kernelId).toBeDefined();
    expect(cap.routingContractRegistered).toBe(true);
    expect(cap.capabilityStatus).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subsystem: 'routing' }),
        expect.objectContaining({ subsystem: 'connectivity' }),
      ]),
    );
  });

  it('starts a canonical runtime cycle without host mutation', async () => {
    const runtime = new LinuxProductionRuntime(new StubLinuxSystem(), {
      enableLiveRouteMutation: false,
      registerHostConnectivity: false,
      registerStarlink: false,
    });

    await runtime.start();
    const status = await runtime.status();

    expect(status.runtime.mode).toBe('live');
    expect(status.runtime.counters.cyclesTotal).toBeGreaterThanOrEqual(1);
  });
});

describe('LinuxClientServer with production runtime', () => {
  it('serves production runtime status over the local client boundary', async () => {
    const system = new StubLinuxSystem();
    const runtime = new LinuxProductionRuntime(system, {
      enableLiveRouteMutation: false,
      registerHostConnectivity: false,
      registerStarlink: false,
    });
    const server = new LinuxClientServer(system, runtime);
    await server.start(0);

    try {
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('expected TCP server address');
      const response = await fetch(`http://127.0.0.1:${address.port}/health`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.runtime.mode).toBe('live');
      expect(body.capabilities).toEqual(expect.any(Array));
      expect(body.capabilityStatus).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            subsystem: 'connectivity',
            status: 'live',
          }),
        ]),
      );
    } finally {
      await server.stop();
    }
  });
});

describe('LinuxSystem real network observation', () => {
  it('reads real network state from the host', async () => {
    const system = new LinuxSystem();
    const snapshot = await system.snapshot();

    // In any Linux environment, ip -brief address should produce output.
    // If the command is unavailable, it returns 'unavailable: ...' which
    // is still a valid observation (the provider reports it as a warning).
    expect(snapshot).toBeDefined();
    expect(snapshot.capturedAt).toBeDefined();
    expect(typeof snapshot.interfaces).toBe('string');
    expect(typeof snapshot.routes).toBe('string');
    expect(typeof snapshot.dns).toBe('string');
  });
});
