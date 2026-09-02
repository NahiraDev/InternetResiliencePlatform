import { describe, expect, it } from 'vitest';
import {
  ConnectivityManager,
  type ConnectivityHealth,
  type ConnectivityProvider,
  type ConnectivityResource,
} from '@irp/connectivity';
import { RoutingEngine } from '@irp/routing';
import type { ActionPlan, RuntimeContext } from '../src/domain/types.js';
import { CanonicalNetworkRuntimeAdapter } from '../src/canonical-network-adapter.js';

const resource = (id: string, priority: number): ConnectivityResource => ({
  providerId: 'fake',
  id,
  type: id === 'wifi0' ? 'wifi' : 'ethernet',
  interfaceName: id,
  state: 'available',
  addresses: ['192.0.2.10'],
  dnsServers: ['1.1.1.1'],
  capabilities: [
    'connect',
    'disconnect',
    'activate',
    'deactivate',
    'monitor',
    'health-check',
    'supports-ipv4',
    'supports-default-route',
    'supports-dns',
  ],
  health: {
    score: priority,
    status: priority >= 60 ? 'healthy' : 'degraded',
    internetReachable: priority >= 60,
    gatewayReachable: true,
    checkedAt: new Date().toISOString(),
    source: 'simulation',
  },
  priority,
  metadata: {},
});

class FakeConnectivityProvider implements ConnectivityProvider {
  readonly id = 'fake';
  readonly type = 'ethernet' as const;
  readonly resources = [resource('eth0', 40), resource('wifi0', 95)];
  active = 'eth0';

  async discover() { return this.resources; }
  async getState(resourceId?: string) { return resourceId === this.active ? 'active' as const : 'available' as const; }
  async getHealth(resourceId?: string): Promise<ConnectivityHealth> {
    const item = this.resources.find((candidate) => candidate.id === resourceId) ?? this.resources[0];
    return item.health!;
  }
  async connect(resourceId: string) { this.active = resourceId; return { ok: true, resourceId, state: 'connected' as const }; }
  async disconnect(resourceId: string) { return { ok: true, resourceId, state: 'available' as const }; }
  async activate(resourceId: string) { this.active = resourceId; return { ok: true, resourceId, state: 'active' as const }; }
  async deactivate(resourceId: string) { return { ok: true, resourceId, state: 'available' as const }; }
  capabilities() { return resource('x', 100).capabilities; }
}

const context = (mode: RuntimeContext['mode']): RuntimeContext => ({
  runtimeId: 'test-runtime',
  correlationId: 'test-correlation',
  mode,
  policySnapshot: {
    id: 'policy', schemaVersion: 1, createdAt: new Date().toISOString(), source: 'test', metadata: {},
    policy: {
      allowedActions: ['connectivity_failover', 'provider_switch', 'route_change'],
      deniedActions: [], capabilityRequirements: {}, securityConstraints: [], actionBudget: 1,
      maxConcurrentActions: 1, confidenceThreshold: 0.5, telemetryFreshnessMs: 30_000,
      simulationOnly: false, failClosed: true,
    },
  },
  capabilitySnapshot: {
    id: 'capabilities', schemaVersion: 1, createdAt: new Date().toISOString(), source: 'test', metadata: {},
    capabilities: ['connectivity.failover', 'route.write', 'network.observe'], trusted: true,
  },
  deadline: new Date(Date.now() + 10_000).toISOString(),
  cancelled: false,
  securityContext: { trusted: true },
  configuration: {
    enabled: true, mode, cycleIntervalMs: 30_000, maxActionsPerCycle: 1, maxConcurrentActions: 1,
    observationFreshnessMs: 30_000, decisionTimeoutMs: 1_000, verificationTimeoutMs: 1_000,
    recoveryTimeoutMs: 5_000, persistenceMode: 'memory', replayEnabled: false,
  },
});

const actionPlan = (intent: ActionPlan['selectedAction']['intent']): ActionPlan => ({
  id: 'plan', schemaVersion: 1, createdAt: new Date().toISOString(), source: 'test', metadata: {},
  selectedAction: {
    id: 'action', schemaVersion: 1, createdAt: new Date().toISOString(), source: 'test', metadata: {},
    intent, expectedBenefit: 0.9, risk: 0.1, confidence: 0.95,
    requiredCapabilities: intent === 'route_change' ? ['route.write'] : ['connectivity.failover'],
    dependencies: [], postconditions: ['network recovered'], verificationRequirements: ['health'], rejectionReasons: [],
  },
  alternatives: [], rejectionReasons: [], expectedBenefit: 0.9, risk: 0.1, confidence: 0.95,
  policyResult: { allowed: true, reasons: [], requiredCapabilities: [] }, requiredCapabilities: [], dependencies: [],
  expectedPostconditions: ['network recovered'], verificationRequirements: ['health'],
});

describe('CanonicalNetworkRuntimeAdapter', () => {
  it('executes and verifies connectivity failover through ConnectivityManager', async () => {
    const connectivity = new ConnectivityManager();
    const provider = new FakeConnectivityProvider();
    await connectivity.registerProvider(provider);
    const adapter = new CanonicalNetworkRuntimeAdapter({ connectivity, routing: new RoutingEngine() });

    const execution = await adapter.execute(actionPlan('connectivity_failover'), context('live'));
    const verification = await adapter.verify(actionPlan('connectivity_failover'), execution, context('live'));

    expect(execution.status).toBe('success');
    expect(verification.status).toBe('success');
    expect(connectivity.getActiveSource()?.sourceId).toBe('fake:wifi0');
  });

  it('never mutates connectivity in safe mode', async () => {
    const connectivity = new ConnectivityManager();
    const provider = new FakeConnectivityProvider();
    await connectivity.registerProvider(provider);
    await connectivity.discoverResources();
    await connectivity.activateSource('fake:eth0');
    const adapter = new CanonicalNetworkRuntimeAdapter({ connectivity, routing: new RoutingEngine() });

    const execution = await adapter.execute(actionPlan('connectivity_failover'), context('safe'));

    expect(execution.simulated).toBe(true);
    expect(connectivity.getActiveSource()?.sourceId).toBe('fake:eth0');
  });
});
