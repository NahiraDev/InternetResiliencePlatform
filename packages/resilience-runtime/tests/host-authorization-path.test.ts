import { describe, expect, it } from 'vitest';
import {
  createCanonicalRuntime,
  createCapabilitySnapshot,
  RuntimeAdapterRegistry,
  type CandidateAction,
  type DecisionProvider,
  type Observation,
  type ObservationProvider,
  type RuntimeAdapter,
} from '../src/index.js';

const observationNow = () => new Date().toISOString();

const failedObservation: Observation = {
  id: 'composition-observation',
  schemaVersion: 1,
  createdAt: observationNow(),
  correlationId: 'composition',
  source: 'test',
  metadata: {},
  category: 'dns',
  metric: 'dns_reachable',
  value: 0,
  timestamp: observationNow(),
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


const SAFE = ['health_reprobe', 'noop', 'degraded_mode', 'recovery', 'rollback'] as const;

const run = async (
  hostTrust: NonNullable<Parameters<typeof createCanonicalRuntime>[0]['hostTrust']>,
  input: Parameters<ReturnType<typeof createCanonicalRuntime>['runCycle']>[0] = {},
) => {
  let mutations = 0;
  const adapters = new RuntimeAdapterRegistry();
  adapters.register(mutationAdapter(() => mutations++));
  const composition = createCanonicalRuntime({
    executionMode: 'real',
    observationProviders: [provider],
    decisionProvider,
    adapters,
    hostTrust,
  });
  // `runtime.cycle` takes the mode as given (as the daemon does); `composition.runCycle` pins it to
  // the composition's execution mode.
  const record = await composition.runtime.cycle({ mode: 'live', ...input });
  return { record, mutations: () => mutations };
};

describe('host authorization gates the whole path to a real mutation', () => {
  it('observe-only host trust blocks a live DNS change with the exact reasons and no mutation', async () => {
    const { record, mutations } = await run({ principal: 'daemon', capabilities: ['network.observe'], allowedActions: SAFE });
    expect(record.outcome).toBe('blocked');
    expect(record.policyEvaluation.reasons).toEqual(
      expect.arrayContaining(['action dns_switch is not allowed', 'missing capabilities: dns.write']),
    );
    expect(mutations()).toBe(0);
  });

  it('a caller cannot widen host trust by supplying its own trusted capability snapshot', async () => {
    const { record, mutations } = await run(
      { principal: 'daemon', capabilities: ['network.observe'], allowedActions: SAFE },
      { securityContext: { trusted: true, principal: 'attacker' }, capabilitySnapshot: createCapabilitySnapshot(['dns.write'], true) },
    );
    expect(record.outcome).toBe('blocked');
    expect(record.runtimeContext.capabilitySnapshot.capabilities).toEqual(['network.observe']);
    expect(mutations()).toBe(0);
  });

  it('granting the capability without allowing the intent still blocks', async () => {
    const { record, mutations } = await run({ principal: 'daemon', capabilities: ['network.observe', 'dns.write'], allowedActions: SAFE });
    expect(record.outcome).toBe('blocked');
    expect(record.policyEvaluation.reasons).toContain('action dns_switch is not allowed');
    expect(mutations()).toBe(0);
  });

  it('allowing the intent without the capability still blocks', async () => {
    const { record, mutations } = await run({ principal: 'daemon', capabilities: ['network.observe'], allowedActions: [...SAFE, 'dns_switch'] });
    expect(record.outcome).toBe('blocked');
    expect(record.policyEvaluation.reasons).toContain('missing capabilities: dns.write');
    expect(mutations()).toBe(0);
  });

  it('simulation and safe cycles never mutate, even on a fully live-authorized host', async () => {
    const trust = { principal: 'daemon', capabilities: ['network.observe', 'dns.write'], allowedActions: [...SAFE, 'dns_switch'] } as const;
    const simulated = await run(trust, { mode: 'simulation' });
    expect(simulated.mutations()).toBe(0);
    const safe = await run(trust, { mode: 'safe' });
    expect(safe.mutations()).toBe(0);
    expect(safe.record.outcome).toBe('blocked');
    expect(safe.record.runtimeContext.capabilitySnapshot.capabilities).toEqual(['network.observe']);
    expect(safe.record.policyEvaluation.reasons).toContain('action dns_switch is not allowed');
  });

  it('a fully host-authorized live cycle reaches the adapter exactly once and records verification', async () => {
    const { record, mutations } = await run({ principal: 'daemon', capabilities: ['network.observe', 'dns.write'], allowedActions: [...SAFE, 'dns_switch'] });
    expect(record.policyEvaluation.allowed, JSON.stringify(record.policyEvaluation)).toBe(true);
    expect(mutations()).toBe(1);
    expect(record.executionResult?.simulated).toBe(false);
    expect(record.verificationResult?.status).toBe('success');
  });
});
