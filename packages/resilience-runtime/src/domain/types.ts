export type RuntimeMode = 'live' | 'simulation' | 'safe';
export type RuntimeState =
  | 'idle'
  | 'observing'
  | 'analyzing'
  | 'planning'
  | 'validating'
  | 'executing'
  | 'verifying'
  | 'recovering'
  | 'degraded'
  | 'blocked'
  | 'stopped'
  | 'failed';
export type DecisionOutcome =
  | 'success'
  | 'partial_success'
  | 'failed'
  | 'recovered'
  | 'rolled_back'
  | 'blocked'
  | 'degraded'
  | 'noop'
  | 'simulated';
export type ActionIntent =
  | 'dns_switch'
  | 'connectivity_failover'
  | 'route_change'
  | 'tunnel_switch'
  | 'provider_switch'
  | 'health_reprobe'
  | 'recovery'
  | 'rollback'
  | 'degraded_mode'
  | 'noop';
export type ObservationStatus = 'healthy' | 'degraded' | 'failed' | 'unknown' | 'stale';
export type Severity = 'info' | 'warning' | 'critical';
export type IncidentClassification =
  | 'primary_failure'
  | 'correlated_downstream_failure'
  | 'independent_failure'
  | 'transient_anomaly'
  | 'persistent_degradation'
  | 'security_failure'
  | 'policy_violation';
export interface AuditFields {
  readonly id: string;
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly correlationId?: string | undefined;
  readonly source: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}
export interface RuntimeCounters {
  readonly cyclesTotal: number;
  readonly cyclesFailedTotal: number;
  readonly decisionsTotal: number;
  readonly actionsTotal: number;
  readonly actionsFailedTotal: number;
  readonly verificationsFailedTotal: number;
  readonly recoveriesTotal: number;
  readonly rollbacksTotal: number;
  readonly blockedTotal: number;
  readonly degradedTotal: number;
}
export interface ResiliencePolicy {
  readonly allowedActions: readonly ActionIntent[];
  readonly deniedActions: readonly ActionIntent[];
  readonly capabilityRequirements: Readonly<Record<string, readonly string[]>>;
  readonly securityConstraints: readonly string[];
  readonly actionBudget: number;
  readonly maxConcurrentActions: number;
  readonly confidenceThreshold: number;
  readonly telemetryFreshnessMs: number;
  readonly simulationOnly: boolean;
  readonly failClosed: boolean;
  readonly manualOverride?: boolean | undefined;
}
export interface PolicySnapshot extends AuditFields {
  readonly policy: ResiliencePolicy;
}
export interface CapabilitySnapshot extends AuditFields {
  readonly capabilities: readonly string[];
  readonly trusted: boolean;
}
export interface RuntimeConfiguration {
  readonly enabled: boolean;
  readonly mode: RuntimeMode;
  readonly cycleIntervalMs: number;
  readonly maxActionsPerCycle: number;
  readonly maxConcurrentActions: number;
  readonly observationFreshnessMs: number;
  readonly decisionTimeoutMs: number;
  readonly verificationTimeoutMs: number;
  readonly recoveryTimeoutMs: number;
  readonly persistenceMode: 'memory';
  readonly replayEnabled: boolean;
}
export interface RuntimeContext {
  readonly runtimeId: string;
  readonly correlationId: string;
  readonly mode: RuntimeMode;
  readonly policySnapshot: PolicySnapshot;
  readonly capabilitySnapshot: CapabilitySnapshot;
  readonly observationSnapshot?: ObservationBatch | undefined;
  readonly deadline: string;
  readonly cancelled: boolean;
  readonly securityContext: Readonly<{ trusted: boolean; principal?: string }>;
  readonly configuration: RuntimeConfiguration;
}
export interface Observation extends AuditFields {
  readonly category: string;
  readonly metric: string;
  readonly value: unknown;
  readonly unit?: string | undefined;
  readonly timestamp: string;
  readonly freshnessMs: number;
  readonly confidence: number;
  readonly severity: Severity;
  readonly status: ObservationStatus;
}
export interface ObservationBatch extends AuditFields {
  readonly observations: readonly Observation[];
  readonly stale: boolean;
  readonly minConfidence: number;
}
export interface ObservationProviderResult {
  readonly providerId: string;
  readonly observations: readonly Observation[];
  readonly collectedAt: string;
  readonly errors: readonly string[];
}
export interface Incident extends AuditFields {
  readonly rootCause: string;
  readonly affectedComponents: readonly string[];
  readonly confidence: number;
  readonly evidence: readonly string[];
  readonly correlationReason: string;
  readonly classification: IncidentClassification;
}
export interface CandidateAction extends AuditFields {
  readonly intent: ActionIntent;
  readonly expectedBenefit: number;
  readonly risk: number;
  readonly confidence: number;
  readonly requiredCapabilities: readonly string[];
  readonly dependencies: readonly string[];
  readonly postconditions: readonly string[];
  readonly verificationRequirements: readonly string[];
  readonly rollbackStrategy?: string | undefined;
  readonly rejectionReasons: readonly string[];
}
export interface PolicyEvaluation {
  readonly allowed: boolean;
  readonly reasons: readonly string[];
  readonly requiredCapabilities: readonly string[];
}
export interface ActionPlan extends AuditFields {
  readonly selectedAction: CandidateAction;
  readonly alternatives: readonly CandidateAction[];
  readonly rejectionReasons: readonly string[];
  readonly expectedBenefit: number;
  readonly risk: number;
  readonly confidence: number;
  readonly policyResult: PolicyEvaluation;
  readonly requiredCapabilities: readonly string[];
  readonly dependencies: readonly string[];
  readonly expectedPostconditions: readonly string[];
  readonly verificationRequirements: readonly string[];
  readonly rollbackStrategy?: string | undefined;
}
export interface ActionValidation extends AuditFields {
  readonly valid: boolean;
  readonly reasons: readonly string[];
  readonly policy: PolicyEvaluation;
}
export interface ActionExecution extends AuditFields {
  readonly status: 'skipped' | 'success' | 'failed' | 'duplicate' | 'conflict';
  readonly simulated: boolean;
  readonly actionId: string;
  readonly beforeState?: unknown;
  readonly afterState?: unknown;
  readonly error?: string | undefined;
}
export interface ActionVerification extends AuditFields {
  readonly status: 'success' | 'failed' | 'partial' | 'skipped';
  readonly verifiedPostconditions: readonly string[];
  readonly failedPostconditions: readonly string[];
}
export interface RecoveryPlan extends AuditFields {
  readonly delegatedTo: 'failover';
  readonly status: 'not_required' | 'success' | 'failed' | 'degraded';
  readonly reason: string;
}
export interface RuntimeTransition extends AuditFields {
  readonly from: RuntimeState;
  readonly to: RuntimeState;
}
export interface RuntimeHealth {
  readonly status: 'healthy' | 'degraded' | 'unknown' | 'failed';
  readonly reason: string;
}
export interface DecisionRecord extends AuditFields {
  readonly decisionId: string;
  readonly runtimeStateBefore: RuntimeState;
  readonly runtimeStateAfter: RuntimeState;
  readonly runtimeContext: Readonly<
    Pick<RuntimeContext, 'runtimeId' | 'correlationId' | 'mode' | 'deadline' | 'configuration'>
  >;
  readonly observations: ObservationBatch;
  readonly incidents: readonly Incident[];
  readonly policyEvaluation: PolicyEvaluation;
  readonly candidates: readonly CandidateAction[];
  readonly selectedPlan?: ActionPlan | undefined;
  readonly validation?: ActionValidation;
  readonly executionResult?: ActionExecution | undefined;
  readonly verificationResult?: ActionVerification | undefined;
  readonly recoveryResult?: RecoveryPlan | undefined;
  readonly outcome: DecisionOutcome;
  readonly confidence: number;
  readonly durationMs: number;
  readonly explanation: readonly string[];
}
export interface RuntimeSnapshot {
  readonly state: RuntimeState;
  readonly activeIncident?: Incident | undefined;
  readonly recentObservations?: ObservationBatch | undefined;
  readonly policySnapshot: PolicySnapshot;
  readonly currentPlan?: ActionPlan | undefined;
  readonly currentAction?: CandidateAction | undefined;
  readonly verificationStatus?: ActionVerification | undefined;
  readonly recoveryStatus?: RecoveryPlan | undefined;
  readonly lastDecision?: DecisionRecord | undefined;
  readonly health: RuntimeHealth;
  readonly uptimeMs: number;
  readonly counters: RuntimeCounters;
  readonly mode: RuntimeMode;
}
export interface DecisionReplayInput {
  readonly record: DecisionRecord;
  readonly candidates: readonly CandidateAction[];
}
export interface DecisionReplayResult {
  readonly reproduced: boolean;
  readonly selectedPlan?: ActionPlan | undefined;
  readonly outcome: DecisionOutcome;
  readonly differences: readonly string[];
}
