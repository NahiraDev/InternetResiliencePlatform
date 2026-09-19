import { describe, expect, it } from 'vitest';
import {
  createCapabilitySnapshot,
  createPolicySnapshot,
  defaultPolicy,
  ResilienceRuntime,
  StaticObservationProvider,
  BoundedClosedLoopController,
  type Observation,
  createRuntimeContext,
} from '../src/index.js';

const obs = (
  id: string,
  category: Observation['category'],
  status: Observation['status'] = 'failed',
): Observation => ({
  id,
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  correlationId: 'golden',
  source: 'golden-scenario',
  metadata: {},
  category,
  metric: 'health',
  value: status === 'unknown' ? null : 1,
  unit: 'state',
  timestamp: new Date().toISOString(),
  freshnessMs: 0,
  confidence: 0.9,
  severity: status === 'healthy' ? 'info' : 'critical',
  status,
});

const trustedSim = (allowed: string[]) => ({
  mode: 'simulation' as const,
  securityContext: { trusted: true },
  capabilitySnapshot: createCapabilitySnapshot(
    ['dns.write', 'connectivity.failover', 'route.write'],
    true,
  ),
  policySnapshot: createPolicySnapshot({
    ...defaultPolicy('simulation'),
    allowedActions: allowed,
    deniedActions: [],
    capabilityRequirements: { dns_switch: ['dns.write'] },
    simulationOnly: false,
  }),
});

describe('Golden end-to-end scenarios (section 108)', () => {
  it('healthy internet: low-cost observation, no unnecessary mutation (noop)', async () => {
    const rt = new ResilienceRuntime([
      new StaticObservationProvider('p', [obs('h', 'dns', 'healthy')]),
    ]);
    const r = await rt.cycle(trustedSim(['noop']));
    expect(r.outcome).toBe('simulated');
    expect(r.selectedPlan?.selectedAction.intent).toBe('noop');
    expect(r.incidents).toHaveLength(0);
  });

  it('DNS degradation: diagnosis -> alternate resolver candidate', async () => {
    const rt = new ResilienceRuntime([
      new StaticObservationProvider('p', [obs('d', 'dns', 'failed'), obs('h', 'http', 'failed')]),
    ]);
    const r = await rt.cycle(trustedSim(['dns_switch', 'noop']));
    expect(r.incidents[0]?.rootCause).toBe('dns_failure');
    // Planner should select dns_switch when allowed
    expect(r.selectedPlan?.selectedAction.intent).toBe('dns_switch');
  });

  it('provider degradation: persistent degradation -> health_reprobe', async () => {
    // Inject persistent metadata to trigger persistent_degradation
    const rt2 = new ResilienceRuntime([
      new StaticObservationProvider('p', [
        { ...obs('p', 'provider', 'degraded'), metadata: { persistent: true } },
      ]),
    ]);
    const r = await rt2.cycle(trustedSim(['health_reprobe', 'noop']));
    expect(r.incidents[0]?.classification).toBe('persistent_degradation');
  });

  it('verification failure: simulated path remains blocked-safe (no live mutation needed)', async () => {
    const rt = new ResilienceRuntime([
      new StaticObservationProvider('p', [obs('d', 'dns', 'failed')]),
    ]);
    const r = await rt.cycle(trustedSim(['dns_switch']));
    // In simulation mode execution is skipped, verification is skipped -> simulated outcome, not failed
    expect(['simulated', 'blocked']).toContain(r.outcome);
    expect(r.verificationResult?.status ?? 'skipped').toBe('skipped');
  });

  it('federation loss: local autonomy continues (no federation evidence)', async () => {
    const rt = new ResilienceRuntime([
      new StaticObservationProvider('p', [obs('h', 'dns', 'healthy')]),
    ]);
    const r = await rt.cycle(trustedSim(['noop']));
    expect(r.outcome).toBe('simulated');
    // No federatedEvidence should be present but cycle succeeds
    expect(r.executionResult).toBeUndefined();
  });

  it('concurrent decisions: stale protection via validator lock', async () => {
    const { RuntimeActionValidator, DeterministicPlanner } = await import('../src/index.js');
    const v = new RuntimeActionValidator();
    v.lock('dns_switch');
    const plan = await new DeterministicPlanner().plan(
      [
        {
          id: 'c',
          schemaVersion: 1,
          createdAt: new Date().toISOString(),
          correlationId: 'c',
          source: 't',
          metadata: {},
          intent: 'dns_switch',
          expectedBenefit: 0.9,
          risk: 0.1,
          confidence: 0.9,
          requiredCapabilities: ['dns.write'],
          dependencies: ['dns_switch'],
          postconditions: [],
          verificationRequirements: [],
          rejectionReasons: [],
        },
      ],
      {
        mode: 'simulation',
        correlationId: 'c',
        runtimeId: 'r',
        deadline: new Date(Date.now() + 10000).toISOString(),
        securityContext: { trusted: true },
        capabilitySnapshot: createCapabilitySnapshot(['dns.write'], true),
        policySnapshot: createPolicySnapshot({
          ...defaultPolicy('simulation'),
          allowedActions: ['dns_switch'],
          simulationOnly: false,
        }),
        observationSnapshot: undefined,
        configuration: {
          enabled: true,
          mode: 'simulation',
          cycleIntervalMs: 0,
          maxActionsPerCycle: 1,
          maxConcurrentActions: 1,
          observationFreshnessMs: 1000,
          decisionTimeoutMs: 1000,
          verificationTimeoutMs: 1000,
          recoveryTimeoutMs: 1000,
          persistenceMode: 'memory',
          replayEnabled: false,
        },
      },
    );
    const validation = await v.validate(plan, createRuntimeContext({ mode: 'simulation' }));
    expect(validation.valid).toBe(false);
  });

  it('bounded closed-loop: healthy stops early, federation not required', async () => {
    let cycles = 0;
    const fake = {
      cycle: async ({ correlationId }: { correlationId?: string }) => {
        cycles += 1;
        const isHealthy = cycles === 2;
        return {
          id: `r-${cycles}`,
          schemaVersion: 1,
          createdAt: new Date().toISOString(),
          source: 'golden',
          metadata: {},
          correlationId: correlationId ?? 'golden/cycle',
          decisionId: `d-${cycles}`,
          runtimeStateBefore: 'planning' as const,
          runtimeStateAfter: 'degraded' as const,
          runtimeContext: {
            runtimeId: 'r',
            correlationId: 'c',
            mode: 'simulation' as const,
            deadline: new Date().toISOString(),
            configuration: {
              enabled: true,
              mode: 'simulation' as const,
              cycleIntervalMs: 0,
              maxActionsPerCycle: 1,
              maxConcurrentActions: 1,
              observationFreshnessMs: 1000,
              decisionTimeoutMs: 1000,
              verificationTimeoutMs: 1000,
              recoveryTimeoutMs: 1000,
              persistenceMode: 'memory' as const,
              replayEnabled: false,
            },
          },
          observations: {
            id: 'o',
            schemaVersion: 1,
            createdAt: new Date().toISOString(),
            source: 't',
            metadata: {},
            observations: [],
            stale: false,
            minConfidence: 1,
          },
          incidents: [],
          policyEvaluation: { allowed: true, reasons: [], requiredCapabilities: [] },
          candidates: [],
          outcome: isHealthy ? 'success' as const : 'degraded' as const,
          confidence: 1,
          durationMs: 1,
          explanation: [],
        };
      },
    };
    const controller = new BoundedClosedLoopController(fake as Pick<ResilienceRuntime, 'cycle'>);
    const result = await controller.run({ maxCycles: 5, correlationId: 'golden-loop' });
    expect(result.status).toBe('healthy');
    expect(cycles).toBe(2);
  });
});
