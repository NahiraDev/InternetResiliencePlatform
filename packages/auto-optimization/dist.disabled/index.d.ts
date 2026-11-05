import type { ActionPlan, CandidateAction, EventSink, RuntimeContext, TelemetrySink } from '@irp/resilience-runtime';
import { RuntimePolicyArbitrator } from '@irp/resilience-runtime';
export type OptimizationRisk = 'low' | 'medium' | 'high';
export type AutoOptimizationBlockReason = 'disabled' | 'non_live_runtime' | 'manual_override' | 'policy_denied' | 'security_untrusted' | 'capability_untrusted' | 'low_confidence' | 'high_risk' | 'low_expected_benefit' | 'expired' | 'cooldown' | 'budget_exhausted' | 'validation_failed';
export interface OptimizationRecommendation {
    readonly id: string;
    readonly plan: ActionPlan;
    readonly source: 'learning' | 'recommendation' | 'operator';
    readonly confidence: number;
    readonly risk: number;
    readonly expectedBenefit: number;
    readonly explanation: readonly string[];
    readonly createdAt: string;
    readonly expiresAt?: string;
}
export interface AutoOptimizationPolicy {
    readonly enabled: boolean;
    readonly minimumConfidence: number;
    readonly maximumRisk: number;
    readonly minimumExpectedBenefit: number;
    readonly cooldownMs: number;
    readonly budgetWindowMs: number;
    readonly maxActionsPerWindow: number;
    readonly allowedRisks: readonly OptimizationRisk[];
    readonly deniedIntents: readonly CandidateAction['intent'][];
    readonly requireLiveRuntime: boolean;
    readonly requireTrustedSecurityContext: boolean;
    readonly requireTrustedCapabilities: boolean;
}
export interface AutoOptimizationState {
    readonly enabled: boolean;
    readonly actionsInWindow: number;
    readonly windowStartedAt: number;
    readonly lastAppliedAt?: number;
    readonly lastOutcome?: 'applied' | 'rolled_back' | 'failed' | 'blocked';
    readonly lastRecommendationId?: string;
}
export interface AutoOptimizationStateStore {
    get(): Promise<AutoOptimizationState>;
    set(state: AutoOptimizationState): Promise<void>;
}
export declare class MemoryAutoOptimizationStateStore implements AutoOptimizationStateStore {
    private state;
    constructor(enabled?: boolean);
    get(): Promise<AutoOptimizationState>;
    set(state: AutoOptimizationState): Promise<void>;
}
export interface AutoOptimizationPorts {
    readonly events?: EventSink;
    readonly telemetry?: TelemetrySink;
    readonly policyArbitrator?: RuntimePolicyArbitrator;
}
export interface AutoOptimizationEvaluation {
    readonly allowed: boolean;
    readonly reasons: readonly string[];
    readonly blockReasons: readonly AutoOptimizationBlockReason[];
    readonly policyResult: Awaited<ReturnType<RuntimePolicyArbitrator['evaluate']>>;
}
export interface AutoOptimizationResult {
    /**
     * `recommended` is deliberately not an execution outcome. A caller must
     * submit the plan to ResilienceRuntime, which remains the only mutation,
     * verification, rollback, and recovery authority.
     */
    readonly status: 'blocked' | 'recommended';
    readonly recommendationId: string;
    readonly evaluation: AutoOptimizationEvaluation;
    readonly reason: string;
}
export declare const defaultAutoOptimizationPolicy: () => AutoOptimizationPolicy;
export declare class AutoOptimizationEngine {
    private readonly policy;
    private readonly ports;
    private readonly store;
    private readonly now;
    private readonly policyArbitrator;
    private enabledOverride?;
    constructor(policy: AutoOptimizationPolicy | undefined, ports: AutoOptimizationPorts, store?: AutoOptimizationStateStore, now?: () => number);
    setEnabled(enabled: boolean): Promise<void>;
    getState(): Promise<AutoOptimizationState>;
    evaluate(recommendation: OptimizationRecommendation, context: RuntimeContext): Promise<AutoOptimizationEvaluation>;
    /**
     * Evaluates and publishes a recommendation. This package intentionally
     * cannot execute an ActionPlan: recommendation generation must not become a
     * second privileged control plane beside ResilienceRuntime.
     */
    submit(recommendation: OptimizationRecommendation, context: RuntimeContext): Promise<AutoOptimizationResult>;
    private recordOutcome;
    private emit;
    private metric;
}
export declare const buildRecommendation: (plan: ActionPlan, input: Omit<OptimizationRecommendation, "plan">) => OptimizationRecommendation;
//# sourceMappingURL=index.d.ts.map