/**
 * Intent assurance and drift detection for Phase 85.
 * Observational only: never applies mutations.
 * Drift signals feed the existing decision / closed-loop path.
 */

import type { CompiledIntent } from '../domain/types.js';
import { isCompiledIntentEffective } from './compiler.js';

export type DriftSeverity = 'none' | 'low' | 'medium' | 'high';
export type RecommendedAdmission = 'ALLOW' | 'PLAN_ONLY' | 'REQUIRE_APPROVAL' | 'DENY';

export interface ObservedMetrics {
  readonly latencyMs?: number;
  readonly packetLoss?: number;
  readonly jitterMs?: number;
  readonly throughputMbps?: number;
  readonly reachability?: number;
  readonly [key: string]: number | undefined;
}

export interface DriftSignal {
  readonly intentId: string;
  readonly observedDelta: Readonly<Record<string, number>>;
  readonly severity: DriftSeverity;
  readonly recommendedAdmission: RecommendedAdmission;
  readonly reasons: readonly string[];
  readonly effective: boolean;
}

const DEFAULT_THRESHOLDS = {
  latencyMs: 150,
  packetLoss: 0.05,
  jitterMs: 30,
  throughputMbps: 5,
  reachability: 0.9,
} as const;

/**
 * Detects drift between a compiled intent's desired outcomes and observed metrics.
 * Returns a structured signal suitable for audit and closed-loop consumption.
 * Does not mutate anything.
 */
export function detectIntentDrift(
  intent: CompiledIntent,
  observed: ObservedMetrics,
  now = new Date(),
): DriftSignal {
  const effective = isCompiledIntentEffective(intent, now);
  const deltas: Record<string, number> = {};
  const reasons: string[] = [];

  if (!effective) {
    reasons.push('intent is not currently effective (expired, not yet active, or superseded)');
    return {
      intentId: intent.intentId,
      observedDelta: Object.freeze(deltas),
      severity: 'none',
      recommendedAdmission: 'DENY',
      reasons: Object.freeze(reasons),
      effective: false,
    };
  }

  let severityScore = 0;

  if (observed.latencyMs !== undefined && observed.latencyMs > DEFAULT_THRESHOLDS.latencyMs) {
    const delta = observed.latencyMs - DEFAULT_THRESHOLDS.latencyMs;
    deltas.latencyMs = delta;
    reasons.push(`latency exceeds threshold by ${delta.toFixed(1)} ms`);
    severityScore += Math.min(3, delta / 50);
  }

  if (observed.packetLoss !== undefined && observed.packetLoss > DEFAULT_THRESHOLDS.packetLoss) {
    const delta = observed.packetLoss - DEFAULT_THRESHOLDS.packetLoss;
    deltas.packetLoss = delta;
    reasons.push(`packet loss exceeds threshold by ${(delta * 100).toFixed(1)}%`);
    severityScore += Math.min(3, delta * 40);
  }

  if (
    observed.reachability !== undefined &&
    observed.reachability < DEFAULT_THRESHOLDS.reachability
  ) {
    const delta = DEFAULT_THRESHOLDS.reachability - observed.reachability;
    deltas.reachability = -delta;
    reasons.push(`reachability below threshold by ${(delta * 100).toFixed(1)}%`);
    severityScore += Math.min(3, delta * 10);
  }

  let severity: DriftSeverity = 'none';
  let recommended: RecommendedAdmission = 'ALLOW';

  if (severityScore >= 4) {
    severity = 'high';
    recommended = 'REQUIRE_APPROVAL';
  } else if (severityScore >= 2) {
    severity = 'medium';
    recommended = 'PLAN_ONLY';
  } else if (severityScore > 0) {
    severity = 'low';
    recommended = 'ALLOW';
  }

  if (reasons.length === 0) {
    reasons.push('no significant drift detected against default thresholds');
  }

  return Object.freeze({
    intentId: intent.intentId,
    observedDelta: Object.freeze(deltas),
    severity,
    recommendedAdmission: recommended,
    reasons: Object.freeze(reasons),
    effective: true,
  });
}
