import { randomUUID } from 'node:crypto';
import type {
  ActionPlan,
  CandidateAction,
  EventSink,
  RuntimeContext,
  TelemetrySink,
} from '@irp/resilience-runtime';
import { RuntimePolicyArbitrator } from '@irp/resilience-runtime';

export type OptimizationRisk = 'low' | 'medium' | 'high';
export type AutoOptimizationBlockReason =
  | 'disabled'
  | 'non_live_runtime'
  | 'manual_override'
  | 'policy_denied'
  | 'security_untrusted'
  | 'capability_untrusted'
  | 'low_confidence'
  | 'high_risk'
  | 'low_expected_benefit'
  | 'expired'
  | 'cooldown'
  | 'budget_exhausted'
  | 'validation_failed';

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

export class MemoryAutoOptimizationStateStore implements AutoOptimizationStateStore {
  private state: AutoOptimizationState;

  constructor(enabled = false) {
    this.state = {
      enabled,
      actionsInWindow: 0,
      windowStartedAt: Date.now(),
    };
  }

  async get(): Promise<AutoOptimizationState> {
    return { ...this.state };
  }

  async set(state: AutoOptimizationState): Promise<void> {
    this.state = { ...state };
  }
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

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export const defaultAutoOptimizationPolicy = (): AutoOptimizationPolicy => ({
  enabled: false,
  minimumConfidence: 90,
  maximumRisk: 25,
  minimumExpectedBenefit: 60,
  cooldownMs: 30_000,
  budgetWindowMs: 60 * 60 * 1_000,
  maxActionsPerWindow: 6,
  allowedRisks: ['low'],
  deniedIntents: ['rollback', 'degraded_mode'],
  requireLiveRuntime: true,
  requireTrustedSecurityContext: true,
  requireTrustedCapabilities: true,
});

const validatePolicy = (policy: AutoOptimizationPolicy): void => {
  if (
    !Number.isFinite(policy.minimumConfidence) ||
    policy.minimumConfidence < 0 ||
    policy.minimumConfidence > 100
  )
    throw new Error('minimumConfidence must be between 0 and 100');
  if (!Number.isFinite(policy.maximumRisk) || policy.maximumRisk < 0 || policy.maximumRisk > 100)
    throw new Error('maximumRisk must be between 0 and 100');
  if (
    !Number.isFinite(policy.minimumExpectedBenefit) ||
    policy.minimumExpectedBenefit < 0 ||
    policy.minimumExpectedBenefit > 100
  )
    throw new Error('minimumExpectedBenefit must be between 0 and 100');
  if (!Number.isInteger(policy.cooldownMs) || policy.cooldownMs < 0)
    throw new Error('cooldownMs must be a non-negative integer');
  if (!Number.isInteger(policy.budgetWindowMs) || policy.budgetWindowMs <= 0)
    throw new Error('budgetWindowMs must be greater than zero');
  if (!Number.isInteger(policy.maxActionsPerWindow) || policy.maxActionsPerWindow < 0)
    throw new Error('maxActionsPerWindow must be a non-negative integer');
};

export class AutoOptimizationEngine {
  private readonly policy: AutoOptimizationPolicy;
  private readonly ports: AutoOptimizationPorts;
  private readonly store: AutoOptimizationStateStore;
  private readonly now: () => number;
  private readonly policyArbitrator: RuntimePolicyArbitrator;
  private enabledOverride?: boolean;

  constructor(
    policy: AutoOptimizationPolicy = defaultAutoOptimizationPolicy(),
    ports: AutoOptimizationPorts,
    store: AutoOptimizationStateStore = new MemoryAutoOptimizationStateStore(policy.enabled),
    now: () => number = Date.now,
  ) {
    validatePolicy(policy);
    this.policy = policy;
    this.ports = ports;
    this.store = store;
    this.now = now;
    this.policyArbitrator = ports.policyArbitrator ?? new RuntimePolicyArbitrator();
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabledOverride = enabled;
    const state = await this.store.get();
    await this.store.set({ ...state, enabled });
  }

  async getState(): Promise<AutoOptimizationState> {
    return this.store.get();
  }

  async evaluate(
    recommendation: OptimizationRecommendation,
    context: RuntimeContext,
  ): Promise<AutoOptimizationEvaluation> {
    const policy = this.policy;
    const state = await this.store.get();
    const enabled = this.enabledOverride ?? state.enabled;
    const reasons: string[] = [];
    const blockReasons: AutoOptimizationBlockReason[] = [];

    if (!enabled) {
      reasons.push('automatic optimization is disabled');
      blockReasons.push('disabled');
    }
    if (policy.requireLiveRuntime && context.mode !== 'live') {
      reasons.push('automatic optimization requires live runtime mode');
      blockReasons.push('non_live_runtime');
    }
    if (context.policySnapshot.policy.manualOverride) {
      reasons.push('runtime manual override is active');
      blockReasons.push('manual_override');
    }
    if (policy.requireTrustedSecurityContext && !context.securityContext.trusted) {
      reasons.push('security context is not trusted');
      blockReasons.push('security_untrusted');
    }
    if (policy.requireTrustedCapabilities && !context.capabilitySnapshot.trusted) {
      reasons.push('capability snapshot is not trusted');
      blockReasons.push('capability_untrusted');
    }

    const recommendationConfidence = clamp(recommendation.confidence);
    const planConfidence = clamp(recommendation.plan.confidence);
    if (
      recommendationConfidence < policy.minimumConfidence ||
      planConfidence < policy.minimumConfidence
    ) {
      reasons.push('recommendation confidence is below the automatic-apply threshold');
      blockReasons.push('low_confidence');
    }
    if (recommendation.risk > policy.maximumRisk || recommendation.plan.risk > policy.maximumRisk) {
      reasons.push('recommendation risk exceeds the automatic-apply threshold');
      blockReasons.push('high_risk');
    }
    if (
      recommendation.expectedBenefit < policy.minimumExpectedBenefit ||
      recommendation.plan.expectedBenefit < policy.minimumExpectedBenefit
    ) {
      reasons.push('expected benefit is below the automatic-apply threshold');
      blockReasons.push('low_expected_benefit');
    }
    const riskClass: OptimizationRisk =
      recommendation.risk <= 10 ? 'low' : recommendation.risk <= 25 ? 'medium' : 'high';
    if (!policy.allowedRisks.includes(riskClass)) {
      reasons.push('recommendation risk class is not enabled by policy');
      blockReasons.push('high_risk');
    }
    if (policy.deniedIntents.includes(recommendation.plan.selectedAction.intent)) {
      reasons.push(
        `action intent ${recommendation.plan.selectedAction.intent} is denied for auto-optimization`,
      );
      blockReasons.push('policy_denied');
    }
    if (recommendation.expiresAt && Date.parse(recommendation.expiresAt) <= this.now()) {
      reasons.push('recommendation has expired');
      blockReasons.push('expired');
    }

    const now = this.now();
    const windowAge = now - state.windowStartedAt;
    const effectiveActionsInWindow = windowAge >= policy.budgetWindowMs ? 0 : state.actionsInWindow;
    if (effectiveActionsInWindow >= policy.maxActionsPerWindow) {
      reasons.push('automatic optimization action budget is exhausted');
      blockReasons.push('budget_exhausted');
    }

    if (state.lastAppliedAt !== undefined && now - state.lastAppliedAt < policy.cooldownMs) {
      reasons.push('automatic optimization is in cooldown');
      blockReasons.push('cooldown');
    }

    const policyResult = await this.policyArbitrator.evaluate(recommendation.plan, context);
    if (!policyResult.allowed) {
      reasons.push(...policyResult.reasons);
      blockReasons.push('policy_denied');
    }

    return {
      allowed: reasons.length === 0,
      reasons,
      blockReasons: [...new Set(blockReasons)],
      policyResult,
    };
  }

  /**
   * Evaluates and publishes a recommendation. This package intentionally
   * cannot execute an ActionPlan: recommendation generation must not become a
   * second privileged control plane beside ResilienceRuntime.
   */
  async submit(
    recommendation: OptimizationRecommendation,
    context: RuntimeContext,
  ): Promise<AutoOptimizationResult> {
    const evaluation = await this.evaluate(recommendation, context);
    await this.emit('auto_optimization.evaluated', {
      recommendationId: recommendation.id,
      allowed: evaluation.allowed,
      blockReasons: evaluation.blockReasons,
    });

    if (!evaluation.allowed) {
      await this.recordOutcome(recommendation.id, 'blocked');
      await this.emit('auto_optimization.blocked', {
        recommendationId: recommendation.id,
        reasons: evaluation.reasons,
        blockReasons: evaluation.blockReasons,
      });
      this.metric('irp_auto_optimization_blocked_total');
      return {
        status: 'blocked',
        recommendationId: recommendation.id,
        evaluation,
        reason: evaluation.reasons.join('; '),
      };
    }

    await this.emit('auto_optimization.recommended', {
      recommendationId: recommendation.id,
      actionId: recommendation.plan.selectedAction.id,
      intent: recommendation.plan.selectedAction.intent,
    });
    this.metric('irp_auto_optimization_recommended_total');
    return {
      status: 'recommended',
      recommendationId: recommendation.id,
      evaluation,
      reason: 'recommendation approved; submit it to ResilienceRuntime for canonical execution',
    };
  }

  private async recordOutcome(
    recommendationId: string,
    outcome: AutoOptimizationState['lastOutcome'],
    countAgainstBudget = false,
  ): Promise<void> {
    const current = await this.store.get();
    const now = this.now();
    const resetWindow = now - current.windowStartedAt >= this.policy.budgetWindowMs;
    await this.store.set({
      ...current,
      actionsInWindow: countAgainstBudget
        ? resetWindow
          ? 1
          : current.actionsInWindow + 1
        : resetWindow
          ? 0
          : current.actionsInWindow,
      windowStartedAt: resetWindow ? now : current.windowStartedAt,
      ...(countAgainstBudget || current.lastAppliedAt !== undefined
        ? { lastAppliedAt: countAgainstBudget ? now : current.lastAppliedAt }
        : {}),
      ...(outcome !== undefined ? { lastOutcome: outcome } : {}),
      lastRecommendationId: recommendationId,
    });
  }

  private async emit(event: string, payload: Record<string, unknown>): Promise<void> {
    await this.ports.events?.emit(event, {
      ...payload,
      eventId: randomUUID(),
      occurredAt: new Date(this.now()).toISOString(),
      source: 'auto-optimization',
    });
  }

  private metric(name: string): void {
    this.ports.telemetry?.increment(name, 1);
  }
}

export const buildRecommendation = (
  plan: ActionPlan,
  input: Omit<OptimizationRecommendation, 'plan'>,
): OptimizationRecommendation => ({
  ...input,
  plan,
  confidence: clamp(input.confidence),
  risk: clamp(input.risk),
  expectedBenefit: clamp(input.expectedBenefit),
});
