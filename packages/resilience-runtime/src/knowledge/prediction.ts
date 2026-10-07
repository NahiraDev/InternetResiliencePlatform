/**
 * Predictive signals for issue #276 (task 7).
 *
 * A prediction always declares a confidence and a time horizon, and is
 * deliberately kept distinguishable from observation and measurement: a
 * prediction can inform ranking, but it can never be promoted into measured
 * state or used as proof that a mutation succeeded.
 */

import { deepFreeze } from '../domain/ids.js';
import {
  type KnowledgeRecord,
  createKnowledgeRecord,
  decayedConfidence,
} from './knowledge-record.js';

export type PredictiveDirection = 'degrading' | 'stable' | 'improving';

export interface PredictiveSignal {
  readonly subjectId: string;
  readonly direction: PredictiveDirection;
  readonly confidence: number;
  /** Length of the prediction window in ms. */
  readonly horizonMs: number;
  /** Instant the prediction covers, i.e. now + horizon. */
  readonly horizonEnd: string;
  /** Objective evidence contributed while the prediction remains valid. */
  readonly objectiveEvidence: Readonly<Record<string, number>>;
  readonly rationale: string;
}

export interface PredictorOptions {
  /** Minimum confidence required before a prediction is admissible. */
  readonly minConfidence?: number;
  /** Maximum horizon a caller is willing to act on. */
  readonly maxHorizonMs?: number;
}

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/**
 * Fuses several decayed signals into one consensus prediction.
 *
 * Weighted by decayed confidence, so stale signals fade out. Returns `undefined`
 * when no signal clears `minConfidence`, rather than inventing a weak prediction.
 */
export const fusePredictions = (
  records: readonly KnowledgeRecord[],
  options: PredictorOptions & { readonly subjectId?: string; readonly nowMs?: number } = {},
): PredictiveSignal | undefined => {
  const minConfidence = clamp01(options.minConfidence ?? 0.3);
  const maxHorizonMs = Math.max(0, options.maxHorizonMs ?? 60 * 60 * 1000);
  const nowMs = options.nowMs ?? Date.now();

  // Only `prediction` records participate. Observations and measurements must
  // never be fused into a forecast.
  const eligible = records.filter(
    (record) =>
      record.kind === 'prediction' &&
      (options.subjectId === undefined || record.scope.pathId === options.subjectId) &&
      decayedConfidence(record, nowMs) >= minConfidence,
  );
  if (eligible.length === 0) return undefined;

  const directionWeight: Record<PredictiveDirection, number> = {
    degrading: 0,
    stable: 0,
    improving: 0,
  };
  const evidenceWeight = new Map<string, { sum: number; weight: number }>();
  let totalWeight = 0;
  let horizonWeighted = 0;
  let confidenceWeighted = 0;
  const rationales: string[] = [];

  for (const record of eligible) {
    const confidence = decayedConfidence(record, nowMs);
    const direction = readDirection(record.detail?.direction);
    const horizonMs = readHorizon(record);
    const weight = confidence * Math.max(0.1, Math.min(1, horizonMs / Math.max(1, maxHorizonMs)));
    directionWeight[direction] += weight;
    totalWeight += weight;
    horizonWeighted += horizonMs * weight;
    confidenceWeighted += confidence * weight;
    rationales.push(`${record.id}:${direction}@${Math.round(confidence * 100)}%`);
    for (const [objective, value] of Object.entries(record.objectiveEvidence ?? {})) {
      const entry = evidenceWeight.get(objective) ?? { sum: 0, weight: 0 };
      entry.sum += clamp01(value as number) * weight;
      entry.weight += weight;
      evidenceWeight.set(objective, entry);
    }
  }
  if (totalWeight <= 0) return undefined;

  const direction = (Object.entries(directionWeight).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0]?.[0] ?? 'stable') as PredictiveDirection;

  // Only keep objectives whose fused weight is meaningful, so a single weak
  // signal cannot pollute a dimension.
  const objectiveEvidence: Record<string, number> = {};
  for (const [objective, entry] of evidenceWeight) {
    const share = entry.weight / totalWeight;
    if (share >= 0.2) objectiveEvidence[objective] = entry.sum / entry.weight;
  }

  const horizonMs = Math.round(horizonWeighted / totalWeight);
  return deepFreeze({
    subjectId: options.subjectId ?? eligible[0]!.id,
    direction,
    confidence: clamp01(confidenceWeighted / totalWeight),
    horizonMs,
    horizonEnd: new Date(nowMs + horizonMs).toISOString(),
    objectiveEvidence: Object.freeze(objectiveEvidence),
    rationale: `fused ${eligible.length} prediction(s): ${rationales.sort().join(', ')}`,
  });
};

const readDirection = (value: unknown): PredictiveDirection =>
  value === 'degrading' || value === 'stable' || value === 'improving' ? value : 'stable';

const readHorizon = (record: KnowledgeRecord): number => {
  const declared = record.detail?.horizonMs;
  if (typeof declared === 'number' && Number.isFinite(declared) && declared > 0) return declared;
  if (record.expiresAt !== undefined) {
    const horizon = Date.parse(record.expiresAt) - Date.parse(record.observedAt);
    if (Number.isFinite(horizon) && horizon > 0) return horizon;
  }
  return 60_000;
};

/**
 * Builds a prediction record. Predictions must declare an expiry so they cannot
 * silently become permanent knowledge.
 */
export const predictiveSignalRecord = (input: {
  readonly subjectId: string;
  readonly destination?: string;
  readonly providerId?: string;
  readonly pathId?: string;
  readonly direction: PredictiveDirection;
  readonly confidence: number;
  readonly horizonMs: number;
  readonly producer: string;
  readonly correlationId: string;
  readonly objectiveEvidence?: Readonly<Partial<Record<string, number>>>;
  readonly nowMs?: number;
}): KnowledgeRecord => {
  const nowMs = input.nowMs ?? Date.now();
  const observedAt = new Date(nowMs).toISOString();
  return {
    ...createKnowledgeRecord({
      kind: 'prediction',
      source: 'history',
      provenance: {
        producer: input.producer,
        source: 'history',
        trustLevel: 'medium',
      },
      correlationId: input.correlationId,
      observedAt,
      expiresAt: new Date(nowMs + Math.max(1, input.horizonMs)).toISOString(),
      confidence: input.confidence,
      scope: {
        ...(input.destination !== undefined ? { destination: input.destination } : {}),
        ...(input.providerId !== undefined ? { providerId: input.providerId } : {}),
        ...(input.pathId !== undefined ? { pathId: input.pathId } : {}),
      },
      objectiveEvidence: input.objectiveEvidence,
      detail: {
        direction: input.direction,
        horizonMs: Math.max(1, input.horizonMs),
        subjectId: input.subjectId,
      },
    }),
  };
};
