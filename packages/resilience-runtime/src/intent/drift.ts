import { isCompiledIntentEffective } from './compiler.js';
import type { CompiledIntent } from '../domain/types.js';

export type DriftSeverity = 'none' | 'low' | 'medium' | 'high';

export interface IntentDriftResult {
  readonly intentId: string;
  readonly effective: boolean;
  readonly observedDelta: Record<string, unknown>;
  readonly severity: DriftSeverity;
  readonly recommendedAdmission: 'ALLOW' | 'PLAN_ONLY' | 'REQUIRE_APPROVAL' | 'DENY' | 'OBSERVE_ONLY';
  readonly reasons: readonly string[];
}

/**
 * Observe-only drift detector. Never mutates state or applies changes.
 * Compares observed numeric metrics against the intent's objectives map.
 * Any detected drift is returned as OBSERVE_ONLY so that callers must still
 * route through intent governance and the safety kernel before any action.
 */
export const detectIntentDrift = (
  intent: CompiledIntent,
  observed: Readonly<Record<string, unknown>>,
  at = new Date(),
): IntentDriftResult => {
  const effective = isCompiledIntentEffective(intent, at);
  const reasons: string[] = [];

  if (!effective) {
    reasons.push('intent is outside its effective lifecycle window');
    return {
      intentId: intent.intentId,
      effective: false,
      observedDelta: {},
      severity: 'none',
      recommendedAdmission: 'DENY',
      reasons,
    };
  }

  const delta: Record<string, unknown> = {};
  let maxSeverity: DriftSeverity = 'none';

  for (const [key, target] of Object.entries(intent.objectives)) {
    const observedValue = observed[key];
    if (typeof observedValue !== 'number' || typeof target !== 'number') continue;

    // Consider drift when observed is more than 10% below the objective.
    if (observedValue < target * 0.9) {
      delta[key] = { target, observed: observedValue };
      const severity: DriftSeverity = observedValue < target * 0.7 ? 'high' : 'medium';
      if (severity === 'high' || (severity === 'medium' && maxSeverity !== 'high')) {
        maxSeverity = severity;
      }
      reasons.push(`observed ${key}=${observedValue} is below objective ${target}`);
    }
  }

  return {
    intentId: intent.intentId,
    effective: true,
    observedDelta: delta,
    severity: maxSeverity,
    recommendedAdmission: maxSeverity === 'none' ? 'ALLOW' : 'OBSERVE_ONLY',
    reasons: reasons.length > 0 ? reasons : ['no material drift detected'],
  };
};
