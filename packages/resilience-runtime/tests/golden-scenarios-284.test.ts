import { describe, expect, it } from 'vitest';
import {
  createCapabilitySnapshot,
  createPolicySnapshot,
  defaultPolicy,
  ResilienceRuntime,
  StaticObservationProvider,
  type Observation,
} from '../src/index.js';

const obs = (
  id: string,
  category: string,
  status: Observation['status'] = 'failed',
  extra: Partial<Observation> = {},
): Observation => ({
  id,
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  correlationId: 'golden-284',
  source: 'golden-scenario-284',
  metadata: {},
  category,
  metric: 'health',
  value: 1,
  unit: 'state',
  timestamp: new Date().toISOString(),
  freshnessMs: 0,
  confidence: 0.9,
  severity: 'critical',
  status,
  ...extra,
});

const trustedSim = (allowed: string[]) => ({
  mode: 'simulation' as const,
  securityContext: { trusted: true },
  capabilitySnapshot: createCapabilitySnapshot(
    ['dns.write', 'connectivity.failover', 'route.write', 'gateway.select', 'tunnel.rotate'],
    true,
  ),
  policySnapshot: createPolicySnapshot({
    ...defaultPolicy('simulation'),
    allowedActions: allowed,
    deniedActions: [],
    simulationOnly: false,
  }),
});

describe('Golden scenarios, issue #284 batch 2 (gateway/tunnel/restricted/prediction)', () => {
  it('gateway failure: detected as gateway incident, answered with safe diagnostics only', async () => {
    const rt = new ResilienceRuntime([new StaticObservationProvider('p', [obs('gw', 'gateway')])]);
    const r = await rt.cycle(trustedSim(['noop', 'health_reprobe']));
    expect(r.incidents.length).toBeGreaterThan(0);
    expect(r.incidents[0]?.rootCause).toBe('gateway_health');
    expect(r.incidents[0]?.classification).toBe('independent_failure');
    // Safe diagnostic intents only: never a blind gateway failover.
    expect(['noop', 'health_reprobe']).toContain(r.selectedPlan?.selectedAction.intent);
    expect(r.executionResult).toBeUndefined();
  });

  it('tunnel failure: detected as tunnel incident, answered with safe diagnostics only', async () => {
    const rt = new ResilienceRuntime([new StaticObservationProvider('p', [obs('tn', 'tunnel')])]);
    const r = await rt.cycle(trustedSim(['noop', 'health_reprobe']));
    expect(r.incidents.length).toBeGreaterThan(0);
    expect(r.incidents[0]?.rootCause).toBe('tunnel_health');
    expect(r.incidents[0]?.classification).toBe('independent_failure');
    expect(['noop', 'health_reprobe']).toContain(r.selectedPlan?.selectedAction.intent);
    expect(r.executionResult).toBeUndefined();
  });

  it('restricted destination: security evidence fails closed', async () => {
    const rt = new ResilienceRuntime([
      new StaticObservationProvider('p', [obs('sec', 'security')]),
    ]);
    const r = await rt.cycle(trustedSim(['noop']));
    expect(r.incidents[0]?.classification).toBe('security_failure');
    expect(r.incidents[0]?.rootCause).toBe('security_failure');
    // Security failure must never resolve into a live mutation in simulation.
    expect(['blocked', 'simulated', 'degraded', 'noop']).toContain(r.outcome);
    expect(r.executionResult).toBeUndefined();
  });

  it('prediction: advisory forecast does not trigger mutation by itself', async () => {
    const rt = new ResilienceRuntime([
      new StaticObservationProvider('p', [
        obs('healthy', 'dns', 'healthy'),
        {
          ...obs('forecast', 'prediction', 'degraded'),
          metric: 'forecast',
          metadata: { advisory: true },
        },
      ]),
    ]);
    const r = await rt.cycle(trustedSim(['noop']));
    // Advisory forecast resolves to a safe terminal outcome, never a live mutation.
    expect(['simulated', 'blocked', 'degraded', 'noop']).toContain(r.outcome);
    expect(r.executionResult).toBeUndefined();
  });
});
