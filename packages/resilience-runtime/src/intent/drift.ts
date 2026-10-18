import { isCompiledIntentEffective } from './compiler.js';
import type { CompiledIntent } from '../domain/types.js';
import type { IntentObjective } from '@irp/core';

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
 * Objectives where a lower observed value is worse (higher is better).
 * Others (latency, jitter, packetLoss, cost) treat higher observed as worse.
 */
const HIGHER_IS_BETTER = new Set<IntentObjective>([
  'reachability',
  'throughput',
  'reliability',
  'privacy',
  'trust',
  'diversity',
]);

const LOWER_IS_BETTER = new Set<IntentObjective>([
  'latency',
  'jitter',
  'packetLoss',
  'cost',
]);

const isWorse = (objective: string, observed: number, target: number): boolean => {
  if (HIGHER_IS_BETTER.has(objective as IntentObjective)) {
    return observed < target * 0.9;
  }
  if (LOWER_IS_BETTER.has(objective as IntentObjective)) {
    return observed > target * 1.1;
  }
  // Unknown objective: treat any material relative deviation as drift.
  const rel = Math.abs(observed - target) / Math.max(Math.abs(target), 1e-6);
  return rel > 0.1;
};

const severityOf = (objective: string, observed: number, target: number): DriftSeverity => {
  const worse = isWorse(objective, observed, target);
  if (!worse) return 'none';
  // Known objectives have a direction; unknown objectives do not. For an
  // unknown objective, measure the magnitude of the deviation symmetrically
  // rather than implicitly treating it as lower-is-better.
  const ratio = HIGHER_IS_BETTER.has(objective as IntentObjective)
    ? observed / Math.max(target, 1e-6)
    : LOWER_IS_BETTER.has(objective as IntentObjective)
      ? target / Math.max(observed, 1e-6)
      : Math.min(
          observed / Math.max(Math.abs(target), 1e-6),
          target / Math.max(Math.abs(observed), 1e-6),
        );
  return ratio < 0.7 ? 'high' : 'medium';
};

/**
 * Observe-only drift detector. Never mutates state or applies changes.
 * Compares observed numeric metrics against the intent's objectives map,
 * respecting whether higher or lower values are better for each objective.
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

    if (isWorse(key, observedValue, target)) {
      const severity = severityOf(key, observedValue, target);
      delta[key] = { target, observed: observedValue, direction: HIGHER_IS_BETTER.has(key as IntentObjective) ? 'higher-better' : 'lower-better' };
      if (severity === 'high' || (severity === 'medium' && maxSeverity !== 'high')) {
        maxSeverity = severity;
      }
      reasons.push(`observed ${key}=${observedValue} diverges from objective ${target}`);
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
