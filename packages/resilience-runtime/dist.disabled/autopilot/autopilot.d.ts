import type { EventSink, ObservationProvider, TelemetrySink } from '../ports/ports.js';
import type { ObservationBatch, RuntimeContext } from '../domain/types.js';
export type AutopilotState = 'IDLE' | 'OBSERVING' | 'MEASURING' | 'DETECTED' | 'DIAGNOSING' | 'DECIDING' | 'POLICY_CHECK' | 'PLANNING' | 'READY_TO_APPLY' | 'APPLYING' | 'VERIFYING' | 'SUCCEEDED' | 'ROLLBACK_REQUIRED' | 'ROLLING_BACK' | 'RECOVERING' | 'RECOVERED' | 'FAILED' | 'ESCALATED' | 'CANCELLED' | 'BLOCKED';
export type AutopilotMode = 'OBSERVE_ONLY' | 'ADVISORY' | 'APPROVAL_REQUIRED' | 'CANARY' | 'AUTONOMOUS' | 'EMERGENCY';
export type AutopilotPolicyOutcome = 'ALLOW' | 'ALLOW_WITH_LIMITS' | 'REQUIRE_APPROVAL' | 'DENY' | 'UNKNOWN';
export type AutopilotHealth = 'healthy' | 'degraded' | 'unknown' | 'critical';
export type DiagnosisConfidence = 'CONFIDENT' | 'PROBABLE' | 'POSSIBLE' | 'UNKNOWN';
export type ActionType = 'DNS_SWITCH' | 'DNS_RESTORE' | 'ROUTE_SWITCH' | 'ROUTE_RESTORE' | 'CONNECTIVITY_RESELECT' | 'PROVIDER_DEPRIORITIZE' | 'PROVIDER_RESTORE' | 'ENDPOINT_DISABLE' | 'ENDPOINT_REENABLE' | 'SERVICE_RESTART' | 'CACHE_REFRESH' | 'PROBE_REFRESH';
export type VerificationStatus = 'PASS' | 'FAIL' | 'DEGRADED' | 'UNKNOWN';
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type Json = Readonly<Record<string, unknown>>;
export interface AutopilotIds {
    readonly autopilot_run_id: string;
    readonly incident_id: string;
    readonly decision_id: string;
    readonly action_id: string;
    readonly verification_id: string;
    readonly rollback_id: string;
    readonly trace_id: string;
}
export interface AutopilotObservation {
    readonly id: string;
    readonly timestamp: string;
    readonly subject: string;
    readonly signals: readonly string[];
    readonly batch: ObservationBatch;
    readonly correlation: AutopilotIds;
}
export interface AutopilotMeasurement {
    readonly id: string;
    readonly timestamp: string;
    readonly subject: string;
    readonly metrics: Json;
    readonly baseline: Json;
    readonly deviation: Json;
    readonly confidence: number;
    readonly freshnessMs: number;
    readonly source: string;
    readonly health: AutopilotHealth;
    readonly correlation: AutopilotIds;
}
export interface AutopilotDetection {
    readonly id: string;
    readonly kind: 'threshold' | 'rate_of_change' | 'anomaly' | 'consecutive_failure' | 'recovery' | 'degradation' | 'flapping' | 'none';
    readonly detected: boolean;
    readonly severity: AutopilotHealth;
    readonly evidence: readonly string[];
    readonly cooldownActive: boolean;
    readonly correlation: AutopilotIds;
}
export interface AutopilotDiagnosis {
    readonly id: string;
    readonly root_cause_candidates: readonly string[];
    readonly evidence: readonly string[];
    readonly confidence: DiagnosisConfidence;
    readonly affected_components: readonly string[];
    readonly affected_paths: readonly string[];
    readonly affected_providers: readonly string[];
    readonly recommended_actions: readonly ActionType[];
    readonly risk: RiskLevel;
    readonly correlation: AutopilotIds;
}
export interface BlastRadius {
    readonly targets: readonly string[];
    readonly dependencies: readonly string[];
    readonly trafficPercentage: number;
    readonly providers: readonly string[];
    readonly routes: readonly string[];
}
export interface AutopilotAction {
    readonly action_id: string;
    readonly action_type: ActionType;
    readonly target: string;
    readonly parameters: Json;
    readonly preconditions: readonly string[];
    readonly expected_effect: string;
    readonly timeoutMs: number;
    readonly retry_policy: 'none' | 'bounded';
    readonly maximum_retries: number;
    readonly cooldownMs: number;
    readonly blast_radius: BlastRadius;
    readonly verification_strategy: string;
    readonly rollback_strategy: string;
    readonly required_policy: string;
    readonly risk_level: RiskLevel;
    readonly idempotency_key: string;
    readonly idempotent: boolean;
    readonly consequential: boolean;
}
export interface AutopilotDecision {
    readonly decision_id: string;
    readonly input_snapshot: AutopilotMeasurement;
    readonly diagnosis: AutopilotDiagnosis;
    readonly candidate_actions: readonly AutopilotAction[];
    readonly selected_action?: AutopilotAction;
    readonly reason: string;
    readonly confidence: DiagnosisConfidence;
    readonly expected_effect: string;
    readonly risk: RiskLevel;
    readonly rollback_strategy?: string;
    readonly replay: Json;
}
export interface AutopilotPolicyEvaluation {
    readonly id: string;
    readonly outcome: AutopilotPolicyOutcome;
    readonly reasons: readonly string[];
    readonly safety_gates: readonly {
        name: string;
        passed: boolean;
        reason: string;
    }[];
    readonly limits: AutopilotPolicy['limits'];
    readonly correlation: AutopilotIds;
}
export interface AutopilotPlan {
    readonly id: string;
    readonly action?: AutopilotAction;
    readonly canary: boolean;
    readonly dryRun: boolean;
    readonly shadow: boolean;
    readonly steps: readonly string[];
    readonly policy: AutopilotPolicyEvaluation;
    readonly correlation: AutopilotIds;
}
export interface AutopilotVerification {
    readonly verification_id: string;
    readonly status: VerificationStatus;
    readonly before: AutopilotMeasurement;
    readonly after: AutopilotMeasurement;
    readonly improved: boolean;
    readonly evidence: readonly string[];
    readonly correlation: AutopilotIds;
}
export interface AutopilotRollback {
    readonly rollback_id: string;
    readonly action_id: string;
    readonly status: 'NOT_REQUIRED' | 'COMPLETED' | 'FAILED';
    readonly snapshot?: PreActionSnapshot;
    readonly reason: string;
    readonly correlation: AutopilotIds;
}
export interface AutopilotRecovery {
    readonly id: string;
    readonly status: 'RECOVERED' | 'ESCALATED' | 'FAILED';
    readonly verification: VerificationStatus;
    readonly correlation: AutopilotIds;
}
export interface AutopilotOutcome {
    readonly status: 'SUCCESS' | 'ROLLED_BACK' | 'ESCALATED' | 'BLOCKED' | 'DRY_RUN' | 'SHADOW' | 'NOOP' | 'FAILED';
    readonly durationMs: number;
    readonly metricsBefore?: AutopilotMeasurement;
    readonly metricsAfter?: AutopilotMeasurement;
    readonly correlation: AutopilotIds;
}
export interface AutopilotRun {
    readonly autopilot_run_id: string;
    readonly incident_id: string;
    readonly trace_id: string;
    readonly state: AutopilotState;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly mode: AutopilotMode;
    readonly observation?: AutopilotObservation;
    readonly measurement?: AutopilotMeasurement;
    readonly detection?: AutopilotDetection;
    readonly diagnosis?: AutopilotDiagnosis;
    readonly decision?: AutopilotDecision;
    readonly policyEvaluation?: AutopilotPolicyEvaluation;
    readonly plan?: AutopilotPlan;
    readonly actionResult?: ActionResult;
    readonly verification?: AutopilotVerification;
    readonly rollback?: AutopilotRollback;
    readonly recovery?: AutopilotRecovery;
    readonly outcome?: AutopilotOutcome;
    readonly events: readonly string[];
}
export interface PreActionSnapshot {
    readonly target: string;
    readonly current_state: Json;
    readonly configuration: Json;
    readonly health: AutopilotHealth;
    readonly route_provider_state: Json;
    readonly relevant_metrics: Json;
    readonly timestamp: string;
    readonly version: string;
    readonly checksum: string;
}
export interface ActionResult {
    readonly status: 'SKIPPED' | 'SUCCESS' | 'FAILED' | 'DUPLICATE' | 'CONFLICT';
    readonly started_at: string;
    readonly completed_at: string;
    readonly durationMs: number;
    readonly target: string;
    readonly changed: boolean;
    readonly before_state?: PreActionSnapshot;
    readonly after_state?: Json;
    readonly error?: string;
    readonly retry_count: number;
    readonly verification_status?: VerificationStatus;
    readonly rollback_status?: AutopilotRollback['status'];
}
export interface AutopilotPolicy {
    readonly enabled: boolean;
    readonly mode: AutopilotMode;
    readonly allowedActions: readonly ActionType[];
    readonly emergencyActions: readonly ActionType[];
    readonly minConfidence: DiagnosisConfidence;
    readonly limits: {
        readonly max_targets: number;
        readonly max_concurrent_actions: number;
        readonly max_traffic_percentage: number;
        readonly max_provider_changes: number;
        readonly max_route_changes: number;
        readonly max_action_duration: number;
        readonly max_actions_per_minute: number;
        readonly max_actions_per_hour: number;
        readonly max_rollbacks: number;
        readonly max_failures: number;
    };
    readonly cooldownMs: number;
    readonly canaryPercentage: number;
    readonly version: string;
}
export declare const defaultAutopilotPolicy: () => AutopilotPolicy;
export declare const autopilotTransitions: Readonly<Record<AutopilotState, readonly AutopilotState[]>>;
export declare class AutopilotStateMachine {
    private state;
    constructor(state?: AutopilotState);
    current(): AutopilotState;
    transition(to: AutopilotState): AutopilotState;
}
export declare class ActionCatalog {
    private actions;
    constructor();
    register(type: ActionType, expected: string, verify: string, rollback: string, policy: string, risk: RiskLevel, consequential: boolean): void;
    create(type: ActionType, target: string, parameters: Json, ids: AutopilotIds): AutopilotAction;
    list(): ActionType[];
}
export declare class AutopilotDomainError extends Error {
}
export declare class PolicyDeniedError extends AutopilotDomainError {
}
export declare class SafetyGateError extends AutopilotDomainError {
}
export declare class ActionValidationError extends AutopilotDomainError {
}
export declare class ActionConflictError extends AutopilotDomainError {
}
export declare class CircuitBreakerOpenError extends AutopilotDomainError {
}
/**
 * Historical compatibility model retained for replay/fixture consumers.
 *
 * @deprecated Use ResilienceRuntime (and BoundedClosedLoopController when
 * bounded repetition is required). This model is not a privileged execution
 * authority and production clients must project canonical runtime records.
 */
export declare class NetworkAutopilot {
    private readonly providers;
    private policy;
    readonly events: EventSink;
    readonly telemetry: TelemetrySink;
    readonly catalog: ActionCatalog;
    private readonly breaker;
    private readonly locks;
    private readonly runs;
    private readonly idempotency;
    private actionTimestamps;
    constructor(providers?: readonly ObservationProvider[], policy?: AutopilotPolicy, options?: {
        events?: EventSink;
        telemetry?: TelemetrySink;
    });
    status(): {
        enabled: boolean;
        mode: AutopilotMode;
        circuitBreaker: CircuitBreakerState;
        activeRuns: number;
        policyVersion: string;
    };
    listRuns(): AutopilotRun[];
    getRun(id: string): AutopilotRun | undefined;
    actions(): ActionType[];
    policies(): AutopilotPolicy;
    resetCircuitBreaker(): void;
    run(input?: {
        dryRun?: boolean;
        shadow?: boolean;
        mode?: AutopilotMode;
        forceVerificationFailure?: boolean;
        context?: Partial<RuntimeContext>;
    }): Promise<AutopilotRun>;
    private measure;
    private diagnose;
    private decide;
    private evaluate;
    private withinBudget;
    private apply;
}
export declare const createAutopilotPolicy: (overlay?: Partial<AutopilotPolicy>) => AutopilotPolicy;
export {};
//# sourceMappingURL=autopilot.d.ts.map