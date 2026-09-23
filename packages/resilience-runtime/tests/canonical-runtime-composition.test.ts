import { describe, expect, it } from 'vitest';
import {
  createCanonicalRuntime,
  createCapabilitySnapshot,
  createPolicySnapshot,
  defaultPolicy,
  RuntimeAdapterRegistry,
  type CandidateAction,
  type DecisionProvider,
  type Observation,
  type ObservationProvider,
  type RuntimeAdapter,
} from '../src/index.js';

const failedObservation: Observation = {
  id: 'composition-observation',
  schemaVersion: 1,
  createdAt: '2026-09-23T00:00:00.000Z',
  correlationId: 'composition',
  source: 'test',
  metadata: {},
  category: 'dns',
  metric: 'dns_reachable',
  value: 0,
  timestamp: '2026-09-23T00:00:00.000Z',
  freshnessMs: 0,
  confidence: 1,
  severity: 'critical',
  status: 'failed',
};

const provider: ObservationProvider = {
  id: 'composition-observer',
  async collect() {
    return {
      providerId: this.id,
      observations: [failedObservation],
      collectedAt: failedObservation.createdAt,
      errors: [],
    };
  },
};

const dnsSwitch: CandidateAction = {
  id: 'composition-dns-switch',
  schemaVersion: 1,
  createdAt: failedObservation.createdAt,
  correlationId: 'composition',
  source: 'test',
  metadata: {},
  intent: 'dns_switch',
  expectedBenefit: 0.9,
  risk: 0.1,
  confidence: 0.9,
  requiredCapabilities: ['dns.write'],
  dependencies: ['dns_switch'],
  postconditions: ['dns switched'],
  verificationRequirements: ['dns resolves'],
  rejectionReasons: [],
};

const decisionProvider: DecisionProvider = {
  async decide() {
    return [dnsSwitch];
  },
};

const mutationAdapter = (onExecute: () => void): RuntimeAdapter => ({
  descriptor: {
    adapterId: 'composition-dns',
    subsystem: 'dns',
    version: '1',
    capabilities: ['dns.write'],
    supportedActions: ['dns_switch'],
    supportsSimulation: true,
    supportsSafe: true,
    supportsLive: true,
    requiredPermissions: ['network-control'],
    requiredKernelCapabilities: [],
    verificationSupport: true,
    recoverySupport: true,
  },
  async execute(plan, context) {
    onExecute();
    return {
      id: 'execution',
      schemaVersion: 1,
      createdAt: failedObservation.createdAt,
      correlationId: context.correlationId,
      source: 'test',
      metadata: {},
      status: 'success',
      simulated: false,
      actionId: plan.selectedAction.id,
      beforeState: {},
      afterState: {},
    };
  },
  async verify(plan, _execution, context) {
    return {
      id: 'verification',
      schemaVersion: 1,
      createdAt: failedObservation.createdAt,
      correlationId: context.correlationId,
      source: 'test',
      metadata: {},
      status: 'success',
      verifiedPostconditions: plan.expectedPostconditions,
      failedPostconditions: [],
    };
  },
});

describe('canonical runtime composition', () => {
  it('uses one ResilienceRuntime contract for simulation and real compositions', () => {
    const simulation = createCanonicalRuntime({ executionMode: 'simulation' });
    const real = createCanonicalRuntime({ executionMode: 'real' });

    expect(simulation.runtime.constructor).toBe(real.runtime.constructor);
    expect(simulation.runtime.runtimeId).toBe('runtime-default');
    expect(real.runtime.runtimeId).toBe('runtime-default');
  });

  it('forces simulation cycles through the canonical runtime without host mutation', async () => {
    let mutations = 0;
    const adapters = new RuntimeAdapterRegistry();
    adapters.register(mutationAdapter(() => mutations++));
    const composition = createCanonicalRuntime({
      executionMode: 'simulation',
      observationProviders: [provider],
      decisionProvider,
      adapters,
    });

    const record = await composition.runCycle({
      securityContext: { trusted: true, principal: 'simulation-test' },
      capabilitySnapshot: createCapabilitySnapshot(['dns.write'], true),
      policySnapshot: createPolicySnapshot({
        ...defaultPolicy('simulation'),
        allowedActions: ['dns_switch'],
        capabilityRequirements: { dns_switch: ['dns.write'] },
        simulationOnly: false,
      }),
    });

    expect(record.runtimeContext.mode).toBe('simulation');
    expect(record.outcome).toBe('simulated');
    expect(mutations).toBe(0);
  });

  it('routes real mode through policy, authorization, capability, security and safety gates', async () => {
    let mutations = 0;
    const adapters = new RuntimeAdapterRegistry();
    adapters.register(mutationAdapter(() => mutations++));
    const composition = createCanonicalRuntime({
      executionMode: 'real',
      observationProviders: [provider],
      decisionProvider,
      adapters,
    });

    const record = await composition.runCycle({
      securityContext: { trusted: false },
      capabilitySnapshot: createCapabilitySnapshot([], false),
      policySnapshot: createPolicySnapshot({
        ...defaultPolicy('live'),
        allowedActions: [],
        deniedActions: ['dns_switch'],
        capabilityRequirements: { dns_switch: ['dns.write'] },
        simulationOnly: true,
      }),
    });

    expect(record.runtimeContext.mode).toBe('live');
    expect(record.outcome).toBe('blocked');
    expect(record.policyEvaluation.reasons).toEqual(
      expect.arrayContaining([
        'security context or capability snapshot is untrusted',
        'policy is simulation-only',
        'action dns_switch is not allowed',
        'action dns_switch is denied',
        'missing capabilities: dns.write',
      ]),
    );
    expect(mutations).toBe(0);
  });
});
