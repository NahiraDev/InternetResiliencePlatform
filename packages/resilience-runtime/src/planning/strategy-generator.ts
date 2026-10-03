/**
 * Multi-candidate strategy generation for issue #277 (issue #272 Section F).
 *
 * Section F requires the runtime to "generate multiple candidate strategies"
 * per intent rather than planning a single action. Generation is a deterministic
 * template expansion inside the canonical runtime: it proposes a primary
 * strategy plus fallback/conservative/alternates, and never filters policy.
 * Policy evaluation stays at the canonical planning gate.
 */

import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
import type {
  ActionIntent,
  CandidateAction,
  CompiledIntent,
  RuntimeContext,
} from '../domain/types.js';

export type StrategyKind = 'primary' | 'fallback' | 'conservative' | 'alternate';

export interface StrategyTemplate {
  readonly kind: StrategyKind;
  readonly intent: ActionIntent;
  /** Multiplier applied to the primary candidate's expected benefit. */
  readonly benefitScale: number;
  /** Multiplier applied to the primary candidate's risk. */
  readonly riskScale: number;
  readonly rationale: string;
}

export interface GeneratedStrategy {
  readonly kind: StrategyKind;
  readonly candidate: CandidateAction;
  readonly rationale: string;
}

/** The default ladder: primary, fallback, conservative, alternate. */
export const defaultStrategyTemplates = (): readonly StrategyTemplate[] =>
  Object.freeze([
    {
      kind: 'primary',
      intent: 'connectivity_failover',
      benefitScale: 1,
      riskScale: 1,
      rationale: 'Restore reachability on the primary path with the highest expected benefit.',
    },
    {
      kind: 'fallback',
      intent: 'provider_switch',
      benefitScale: 0.8,
      riskScale: 0.9,
      rationale: 'Shift to a secondary path when the primary action cannot be applied.',
    },
    {
      kind: 'conservative',
      intent: 'degraded_mode',
      benefitScale: 0.3,
      riskScale: 0.2,
      rationale: 'Take no disruptive action and re-evaluate once fresh evidence exists.',
    },
    {
      kind: 'alternate',
      intent: 'health_reprobe',
      benefitScale: 0.6,
      riskScale: 0.5,
      rationale: 'Reduce offered load to protect the degraded path while evidence recovers.',
    },
  ]) as readonly StrategyTemplate[];

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/**
 * Expands templates into concrete candidates. `seed` provides the base benefit,
 * risk and confidence for the primary action; the remaining strategies are
 * derived from it deterministically.
 */
export const generateStrategies = (input: {
  readonly context: RuntimeContext;
  readonly intent?: CompiledIntent;
  readonly templates?: readonly StrategyTemplate[];
  readonly seed: {
    readonly intent: ActionIntent;
    readonly expectedBenefit: number;
    readonly risk: number;
    readonly confidence: number;
    readonly requiredCapabilities?: readonly string[];
    readonly postconditions?: readonly string[];
    readonly verificationRequirements?: readonly string[];
    readonly rollbackStrategy?: string;
  };
}): readonly GeneratedStrategy[] => {
  const templates = input.templates ?? defaultStrategyTemplates();
  const base = input.seed;
  const compiled = input.intent;

  return Object.freeze(
    templates.map((template) => {
      const isPrimary = template.kind === 'primary';
      const candidate: CandidateAction = deepFreeze({
        id: nextId('candidate'),
        schemaVersion: 1,
        createdAt: nowIso(),
        correlationId: input.context.correlationId,
        source: 'resilience-runtime',
        metadata: Object.freeze({
          strategyKind: template.kind,
          ...(compiled !== undefined
            ? { intentId: compiled.intentId, intentVersion: compiled.version }
            : {}),
        }),
        intent: isPrimary ? base.intent : template.intent,
        expectedBenefit: clamp01(base.expectedBenefit * template.benefitScale),
        risk: clamp01(base.risk * template.riskScale),
        confidence: clamp01(isPrimary ? base.confidence : base.confidence * 0.9),
        requiredCapabilities: Object.freeze([...(base.requiredCapabilities ?? [])]),
        dependencies: Object.freeze([]),
        postconditions: Object.freeze([...(base.postconditions ?? [])]),
        verificationRequirements: Object.freeze([...(base.verificationRequirements ?? [])]),
        ...(base.rollbackStrategy !== undefined ? { rollbackStrategy: base.rollbackStrategy } : {}),
        rejectionReasons: Object.freeze([]),
      });
      return Object.freeze({
        kind: template.kind,
        candidate,
        rationale: template.rationale,
      });
    }),
  );
};
