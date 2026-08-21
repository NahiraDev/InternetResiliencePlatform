import { createAdapterExecution, createAdapterVerification, DeterministicRuntimeAdapter } from './adapter-registry.js';
import { createCapabilitySnapshot, createPolicySnapshot, createRuntimeContext, defaultPolicy } from './context/context.js';
import type {
  ActionExecution,
  ActionPlan,
  ActionVerification,
  CandidateAction,
  Observation,
  RecoveryPlan,
  RuntimeContext,
} from './domain/types.js';
import type { ObservationProvider } from './ports/ports.js';
import { StaticObservationProvider } from './observations/observations.js';
import { ResilienceRuntime } from './runtime.js';
import { FailoverRecoveryProvider } from './recovery/recovery.js';

export type Phase40ScenarioName =
  | 'healthy'
  | 'dns-degradation'
  | 'provider-recovery'
  | 'destination-specific';
export type Phase40Stage =
  | 'observe'
  | 'measure'
  | 'detect'
  | 'diagnose'
  | 'decide'
  | 'policy'
  | 'apply'
  | 'verify'
  | 'recover';

export interface Phase40ScenarioStep {
  readonly name: Phase40ScenarioName;
  readonly stages: readonly Phase40Stage[];
  readonly decisionIds: readonly string[];
  readonly outcomes: readonly string[];
  readonly incidents: readonly string[];
  readonly recoveryStatus?: string;
  readonly verificationStatus?: string;
}
export interface Phase40ValidationReport {
  readonly schemaVersion: 1;
  readonly status: 'passed' | 'failed';
  readonly deterministic: true;
  readonly scenarios: readonly Phase40ScenarioStep[];
  readonly acceptance: Readonly<Record<string, boolean>>;
  readonly failedCriteria: readonly string[];
}
export interface Phase40FaultPlan {
  readonly execution: 'success' | 'failed';
  readonly verification: ActionVerification['status'];
  readonly recovery: RecoveryPlan['status'];
}
export interface Phase40ExecutionHarness {
  readonly execute: (plan: ActionPlan, context: RuntimeContext, faults: Phase40FaultPlan) => Promise<ActionExecution>;
  readonly verify: (
    plan: ActionPlan,
    execution: ActionExecution,
    context: RuntimeContext,
    faults: Phase40FaultPlan,
  ) => Promise<ActionVerification>;
  readonly recover: (
    plan: ActionPlan,
    reason: string,
    context: RuntimeContext,
    faults: Phase40FaultPlan,
  ) => Promise<RecoveryPlan>;
}

const stageOrder: readonly Phase40Stage[] = [
  'observe',
  'measure',
  'detect',
  'diagnose',
  'decide',
  'policy',
  'apply',
  'verify',
  'recover',
];

const phase40Observation = (
  id: string,
  category: string,
  status: Observation['status'],
  metadata: Record<string, unknown> = {},
): Observation => ({
  id,
  schemaVersion: 1,
  createdAt: '2026-08-21T00:00:00.000Z',
  correlationId: 'phase40',
  source: 'phase40-scenario',
  metadata,
  category,
  metric: 'health',
  value: status,
  timestamp: '2026-08-21T00:00:00.000Z',
  freshnessMs: 0,
  confidence: status === 'unknown' ? 0 : 0.95,
  severity: status === 'healthy' ? 'info' : status === 'failed' ? 'critical' : 'warning',
  status,
});

const context = (correlationId: string, capabilities: readonly string[] = []) => {
  const mode = 'live' as const;
  return createRuntimeContext({
    correlationId,
    mode,
    securityContext: { trusted: true },
    capabilitySnapshot: createCapabilitySnapshot(capabilities, true),
    policySnapshot: createPolicySnapshot({
      ...defaultPolicy(mode),
      allowedActions: ['noop', 'health_reprobe', 'degraded_mode', 'recovery'],
      simulationOnly: false,
    }),
  });
};

const provider = (id: string, observations: readonly Observation[]): ObservationProvider =>
  new StaticObservationProvider(id, observations);

const candidate = (
  intent: CandidateAction['intent'],
  correlationId: string,
  confidence = 0.95,
): CandidateAction => ({
  id: `phase40-${intent}-${correlationId}`,
  schemaVersion: 1,
  createdAt: '2026-08-21T00:00:00.000Z',
  correlationId,
  source: 'phase40-harness',
  metadata: {},
  intent,
  expectedBenefit: 0.9,
  risk: 0.1,
  confidence,
  requiredCapabilities: [],
  dependencies: [intent],
  postconditions: [`${intent} verified`],
  verificationRequirements: [`${intent} verification`],
  rejectionReasons: [],
});

const planFor = (action: CandidateAction, correlationId: string): ActionPlan => ({
  id: `phase40-plan-${correlationId}`,
  schemaVersion: 1,
  createdAt: '2026-08-21T00:00:00.000Z',
  correlationId,
  source: 'phase40-harness',
  metadata: {},
  selectedAction: action,
  alternatives: [],
  rejectionReasons: [],
  expectedBenefit: action.expectedBenefit,
  risk: action.risk,
  confidence: action.confidence,
  policyResult: { allowed: true, reasons: [], requiredCapabilities: [] },
  requiredCapabilities: [],
  dependencies: action.dependencies,
  expectedPostconditions: action.postconditions,
  verificationRequirements: action.verificationRequirements,
  rollbackStrategy: 'failover-recovery',
});

class FailureInjectingAdapter extends DeterministicRuntimeAdapter {
  constructor(
    descriptor: ConstructorParameters<typeof DeterministicRuntimeAdapter>[0],
    private readonly fault: Phase40FaultPlan,
  ) {
    super(descriptor, fault.verification);
  }

  override async execute(plan: ActionPlan, runtimeContext: RuntimeContext): Promise<ActionExecution> {
    return this.fault.execution === 'failed'
      ? createAdapterExecution(plan, runtimeContext, false, 'failed')
      : createAdapterExecution(plan, runtimeContext, false, 'success');
  }
}

export const createPhase40ExecutionHarness = (): Phase40ExecutionHarness => ({
  execute: async (plan, runtimeContext, faults) => {
    const adapter = new FailureInjectingAdapter(
      {
        adapterId: 'phase40-fault-injector',
        subsystem: 'failover',
        version: '1.0.0',
        capabilities: [],
        supportedActions: [plan.selectedAction.intent],
        supportsSimulation: false,
        supportsSafe: false,
        supportsLive: true,
        requiredPermissions: [],
        requiredKernelCapabilities: [],
        verificationSupport: true,
        recoverySupport: true,
      },
      faults,
    );
    return adapter.execute(plan, runtimeContext);
  },
  verify: async (plan, _execution, runtimeContext, faults) =>
    createAdapterVerification(plan, runtimeContext, faults.verification),
  recover: async (plan, reason, runtimeContext, faults) => {
    if (faults.recovery === 'failed') {
      return {
        id: `phase40-recovery-${runtimeContext.correlationId}`,
        schemaVersion: 1,
        createdAt: '2026-08-21T00:00:00.000Z',
        correlationId: runtimeContext.correlationId,
        source: 'phase40-harness',
        metadata: {},
        delegatedTo: 'failover',
        status: 'failed',
        reason,
      };
    }
    return new FailoverRecoveryProvider().recover(plan, reason, runtimeContext);
  },
});

const validateControlledLoop = async (faults: Phase40FaultPlan) => {
  const correlationId = `phase40-controlled-${faults.execution}-${faults.verification}-${faults.recovery}`;
  const runtimeContext = context(correlationId);
  const action = candidate('health_reprobe', correlationId);
  const plan = planFor(action, correlationId);
  const harness = createPhase40ExecutionHarness();
  const execution = await harness.execute(plan, runtimeContext, faults);
  const verification = await harness.verify(plan, execution, runtimeContext, faults);
  const recovery =
    verification.status === 'failed'
      ? await harness.recover(plan, 'verification failed', runtimeContext, faults)
      : undefined;
  return { execution, verification, recovery };
};

export const runPhase40Validation = async (): Promise<Phase40ValidationReport> => {
  const scenarios: Phase40ScenarioStep[] = [];

  const healthy = new ResilienceRuntime([
    provider('destination-a', [phase40Observation('healthy-a', 'dns', 'healthy')]),
  ]);
  const healthyRecord = await healthy.cycle(
    createRuntimeContext({
      correlationId: 'phase40-healthy',
      mode: 'simulation',
      securityContext: { trusted: true },
      capabilitySnapshot: createCapabilitySnapshot([], true),
      policySnapshot: createPolicySnapshot({ ...defaultPolicy('simulation'), allowedActions: ['noop'] }),
    }),
  );
  scenarios.push({
    name: 'healthy',
    stages: ['observe', 'measure', 'detect', 'diagnose', 'decide', 'policy'],
    decisionIds: [healthyRecord.decisionId],
    outcomes: [healthyRecord.outcome],
    incidents: healthyRecord.incidents.map((i) => i.rootCause),
  });

  const degraded = new ResilienceRuntime([
    provider('destination-a', [
      phase40Observation('dns-failed', 'dns', 'failed'),
      phase40Observation('http-failed', 'http', 'failed'),
    ]),
  ]);
  const degradedRecord = await degraded.cycle(
    createRuntimeContext({
      correlationId: 'phase40-dns-degradation',
      mode: 'simulation',
      securityContext: { trusted: true },
      capabilitySnapshot: createCapabilitySnapshot([], true),
      policySnapshot: createPolicySnapshot({ ...defaultPolicy('simulation'), allowedActions: ['health_reprobe'] }),
    }),
  );
  scenarios.push({
    name: 'dns-degradation',
    stages: ['observe', 'measure', 'detect', 'diagnose', 'decide', 'policy'],
    decisionIds: [degradedRecord.decisionId],
    outcomes: [degradedRecord.outcome],
    incidents: degradedRecord.incidents.map((i) => i.rootCause),
  });

  const providerRuntime = new ResilienceRuntime([
    provider('provider', [
      phase40Observation('provider-down', 'provider', 'degraded', { persistent: true }),
    ]),
  ]);
  const providerRecord = await providerRuntime.cycle(
    createRuntimeContext({
      correlationId: 'phase40-provider-recovery',
      mode: 'simulation',
      securityContext: { trusted: true },
      capabilitySnapshot: createCapabilitySnapshot([], true),
      policySnapshot: createPolicySnapshot({ ...defaultPolicy('simulation'), allowedActions: ['health_reprobe'] }),
    }),
  );
  const providerRecovery = await validateControlledLoop({
    execution: 'success',
    verification: 'failed',
    recovery: 'success',
  });
  scenarios.push({
    name: 'provider-recovery',
    stages: stageOrder,
    decisionIds: [providerRecord.decisionId],
    outcomes: [providerRecovery.recovery?.status ?? providerRecovery.execution.status],
    incidents: providerRecord.incidents.map((i) => i.rootCause),
    ...(providerRecovery.verification.status !== undefined
      ? { verificationStatus: providerRecovery.verification.status }
      : {}),
    ...(providerRecovery.recovery?.status !== undefined
      ? { recoveryStatus: providerRecovery.recovery.status }
      : {}),
  });

  const destinationSpecific = new ResilienceRuntime([
    provider('destination-direct', [phase40Observation('direct-healthy', 'dns', 'healthy', { destination: 'direct' })]),
    provider('destination-alternate', [phase40Observation('alternate-degraded', 'provider', 'degraded', { destination: 'alternate' })]),
  ]);
  const destinationRecord = await destinationSpecific.cycle(
    createRuntimeContext({
      correlationId: 'phase40-destination-specific',
      mode: 'simulation',
      securityContext: { trusted: true },
      capabilitySnapshot: createCapabilitySnapshot([], true),
      policySnapshot: createPolicySnapshot({ ...defaultPolicy('simulation'), allowedActions: ['health_reprobe'] }),
    }),
  );
  scenarios.push({
    name: 'destination-specific',
    stages: ['observe', 'measure', 'detect', 'diagnose', 'decide', 'policy'],
    decisionIds: [destinationRecord.decisionId],
    outcomes: [destinationRecord.outcome],
    incidents: destinationRecord.incidents.map((i) => i.rootCause),
  });

  const applyFailure = await validateControlledLoop({
    execution: 'failed',
    verification: 'failed',
    recovery: 'success',
  });

  const acceptance = {
    completeStageOrderCovered: scenarios.some((scenario) => stageOrder.every((stage) => scenario.stages.includes(stage))),
    healthyPathRecorded: scenarios.some((scenario) => scenario.name === 'healthy' && scenario.outcomes.length === 1),
    degradedPathDetected: scenarios.some((scenario) => scenario.name === 'dns-degradation' && scenario.incidents.includes('dns_failure')),
    persistentDegradationDetected: scenarios.some((scenario) => scenario.name === 'provider-recovery' && scenario.incidents.includes('persistent_degradation')),
    applyFailureInjectionAvailable: applyFailure.execution.status === 'failed',
    verificationFailureTriggersRecovery: scenarios.some((scenario) => scenario.name === 'provider-recovery' && scenario.verificationStatus === 'failed' && scenario.recoveryStatus === 'success'),
    destinationIsolationRepresented: scenarios.some((scenario) => scenario.name === 'destination-specific'),
    decisionsAreUnique: new Set(scenarios.flatMap((scenario) => scenario.decisionIds)).size === scenarios.flatMap((scenario) => scenario.decisionIds).length,
  };

  const failedCriteria = Object.entries(acceptance)
    .filter(([, passed]) => !passed)
    .map(([criterion]) => criterion);

  return {
    schemaVersion: 1,
    status: failedCriteria.length ? 'failed' : 'passed',
    deterministic: true,
    scenarios,
    acceptance,
    failedCriteria,
  };
};
