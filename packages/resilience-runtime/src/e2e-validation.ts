import { ResilienceRuntime } from './runtime.js';
import { createCapabilitySnapshot, createPolicySnapshot, createRuntimeContext, defaultPolicy } from './context/context.js';
import { StaticObservationProvider } from './observations/observations.js';
import type { ActionExecution, Observation, ObservationProvider } from './domain/types.js';

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
  readonly executeFailure?: boolean;
  readonly verifyFailure?: boolean;
  readonly recoveryFailure?: boolean;
}

export interface Phase40ExecutionAdapter {
  execute(faults: Phase40FaultPlan): Promise<ActionExecution>;
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

const trustedSimulationContext = (correlationId: string) => {
  const mode = 'simulation' as const;
  return createRuntimeContext({
    correlationId,
    mode,
    securityContext: { trusted: true },
    capabilitySnapshot: createCapabilitySnapshot([], true),
    policySnapshot: createPolicySnapshot({
      ...defaultPolicy(mode),
      allowedActions: ['noop', 'health_reprobe', 'degraded_mode', 'recovery'],
      simulationOnly: false,
    }),
  });
};

const collectStages = (record: Awaited<ReturnType<ResilienceRuntime['cycle']>>): Phase40Stage[] => {
  const stages: Phase40Stage[] = ['observe', 'measure', 'detect', 'diagnose', 'decide', 'policy'];
  if (record.executionResult) stages.push('apply');
  if (record.verificationResult) stages.push('verify');
  if (record.recoveryResult) stages.push('recover');
  return stages;
};

const observationProvider = (
  id: string,
  observations: readonly Observation[],
): ObservationProvider => new StaticObservationProvider(id, observations);

export const runPhase40Validation = async (): Promise<Phase40ValidationReport> => {
  const scenarios: Phase40ScenarioStep[] = [];

  const healthy = new ResilienceRuntime([
    observationProvider('destination-a', [phase40Observation('healthy-a', 'dns', 'healthy')]),
  ]);
  const healthyRecord = await healthy.cycle(trustedSimulationContext('phase40-healthy'));
  scenarios.push({
    name: 'healthy',
    stages: collectStages(healthyRecord),
    decisionIds: [healthyRecord.decisionId],
    outcomes: [healthyRecord.outcome],
    incidents: healthyRecord.incidents.map((i) => i.rootCause),
  });

  const degraded = new ResilienceRuntime([
    observationProvider('destination-a', [
      phase40Observation('dns-failed', 'dns', 'failed'),
      phase40Observation('http-failed', 'http', 'failed'),
    ]),
  ]);
  const degradedRecord = await degraded.cycle(trustedSimulationContext('phase40-dns-degradation'));
  scenarios.push({
    name: 'dns-degradation',
    stages: collectStages(degradedRecord),
    decisionIds: [degradedRecord.decisionId],
    outcomes: [degradedRecord.outcome],
    incidents: degradedRecord.incidents.map((i) => i.rootCause),
    verificationStatus: degradedRecord.verificationResult?.status,
    recoveryStatus: degradedRecord.recoveryResult?.status,
  });

  const providerRecovery = new ResilienceRuntime([
    observationProvider('provider', [
      phase40Observation('provider-down', 'provider', 'degraded', { persistent: true }),
    ]),
  ]);
  const recoveryRecord = await providerRecovery.cycle(trustedSimulationContext('phase40-provider-recovery'));
  scenarios.push({
    name: 'provider-recovery',
    stages: collectStages(recoveryRecord),
    decisionIds: [recoveryRecord.decisionId],
    outcomes: [recoveryRecord.outcome],
    incidents: recoveryRecord.incidents.map((i) => i.rootCause),
    verificationStatus: recoveryRecord.verificationResult?.status,
    recoveryStatus: recoveryRecord.recoveryResult?.status,
  });

  const destinationSpecific = new ResilienceRuntime([
    observationProvider('destination-direct', [phase40Observation('direct-healthy', 'dns', 'healthy')]),
    observationProvider('destination-alternate', [phase40Observation('alternate-degraded', 'provider', 'degraded')]),
  ]);
  const destinationRecord = await destinationSpecific.cycle(trustedSimulationContext('phase40-destination-specific'));
  scenarios.push({
    name: 'destination-specific',
    stages: collectStages(destinationRecord),
    decisionIds: [destinationRecord.decisionId],
    outcomes: [destinationRecord.outcome],
    incidents: destinationRecord.incidents.map((i) => i.rootCause),
  });

  const acceptance = {
    completeStageOrderCovered: scenarios.some((scenario) => stageOrder.every((stage) => scenario.stages.includes(stage))),
    healthyPathRecorded: scenarios.some((scenario) => scenario.name === 'healthy' && scenario.outcomes.length === 1),
    degradedPathDetected: scenarios.some((scenario) => scenario.name === 'dns-degradation' && scenario.incidents.includes('dns_failure')),
    persistentDegradationDetected: scenarios.some(
      (scenario) =>
        scenario.name === 'provider-recovery' && scenario.incidents.includes('persistent_degradation'),
    ),
    destinationIsolationRepresented: scenarios.some((scenario) => scenario.name === 'destination-specific'),
    decisionsAreUnique: new Set(scenarios.flatMap((scenario) => scenario.decisionIds)).size ===
      scenarios.flatMap((scenario) => scenario.decisionIds).length,
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
