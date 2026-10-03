/**
 * Unified knowledge boundary for issue #276 (issue #272 Section E).
 *
 * One evidence-backed record shape carries every kind of network intelligence.
 * The epistemic `kind` is mandatory so a prediction can never be read as an
 * observation, and a hypothesis can never be read as a measurement.
 *
 * Authority rule: knowledge is always advisory. A `KnowledgeRecord` can raise or
 * lower a candidate's objective score, but it can never grant mutation
 * authority, bypass policy, or mark a candidate as policy-allowed.
 */

import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
import type { AuditFields } from '../domain/types.js';

/** The seven epistemic kinds required by issue #276 task 3. */
export const KNOWLEDGE_KINDS = [
  'observation',
  'measurement',
  'inference',
  'hypothesis',
  'prediction',
  'decision',
  'outcome',
] as const;

export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

/** Evidence source families required by issue #276 task 1. */
export const KNOWLEDGE_SOURCES = [
  'observation',
  'measurement',
  'topology',
  'history',
  'failure-memory',
  'destination',
  'provider',
  'federated',
] as const;

export type KnowledgeSource = (typeof KNOWLEDGE_SOURCES)[number];

/**
 * How strongly a source may be trusted relative to locally measured evidence.
 * This orders arbitration only; it never grants authority.
 */
export const SOURCE_TRUST_ORDER: Readonly<Record<KnowledgeSource, number>> = Object.freeze({
  measurement: 1,
  observation: 0.9,
  topology: 0.85,
  outcome: 0.8,
  destination: 0.75,
  provider: 0.7,
  history: 0.6,
  'failure-memory': 0.55,
  federated: 0.4,
});

/**
 * Remote/federated and historical knowledge may only ever adjust ranking.
 * Only locally measured evidence may inform operational state.
 */
export const isAdvisoryOnly = (source: KnowledgeSource): boolean =>
  source === 'federated' || source === 'history';

export interface KnowledgeProvenance {
  /** Component or agent that produced the knowledge. */
  readonly producer: string;
  readonly source: KnowledgeSource;
  /** Present for federated knowledge; verified by signature check before use. */
  readonly signature?: string | undefined;
  readonly trustLevel?: 'untrusted' | 'low' | 'medium' | 'high' | 'verified';
}

/**
 * Destination/provider scoping. Federated evidence must match the active
 * destination or it is ignored, so one destination's probes cannot influence
 * another destination's decision.
 */
export interface KnowledgeScope {
  readonly destination?: string | undefined;
  readonly providerId?: string | undefined;
  readonly pathId?: string | undefined;
  readonly region?: string | undefined;
}

export interface KnowledgeRecord extends AuditFields {
  readonly kind: KnowledgeKind;
  readonly source: KnowledgeSource;
  readonly provenance: KnowledgeProvenance;
  readonly scope: KnowledgeScope;
  /** When the underlying fact was observed (not when the record was created). */
  readonly observedAt: string;
  /** Absolute expiry; the record is unusable after this instant. */
  readonly expiresAt?: string | undefined;
  /** Half-life in ms used to decay confidence between `observedAt` and expiry. */
  readonly halfLifeMs?: number | undefined;
  /** Stated confidence in [0,1] at `observedAt`. */
  readonly confidence: number;
  /** Ids of independent records that corroborate this one. */
  readonly corroborations: readonly string[];
  /** Objective contributions in [0,1]; direction is intrinsic to the objective. */
  readonly objectiveEvidence?: Readonly<Partial<Record<string, number>>> | undefined;
  /** Free-form, non-authoritative detail. Never interpreted as a capability. */
  readonly detail?: Readonly<Record<string, string | number | boolean>> | undefined;
}

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const isFiniteMs = (value: string): boolean => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
};

/** A record with no expiry never expires. */
const EXPIRY_REQUIRED = true;

export class KnowledgeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeValidationError';
  }
}

/**
 * Validates and constructs a knowledge record. Validation is strict and
 * deterministic: malformed knowledge is rejected rather than silently admitted,
 * because a bad record that reaches arbitration can distort ranking.
 */
export const createKnowledgeRecord = (input: {
  readonly kind: KnowledgeKind;
  readonly source: KnowledgeSource;
  readonly provenance: KnowledgeProvenance;
  readonly scope?: KnowledgeScope;
  readonly observedAt: string;
  readonly expiresAt?: string | undefined;
  readonly halfLifeMs?: number | undefined;
  readonly confidence: number;
  readonly corroborations?: readonly string[];
  readonly objectiveEvidence?: Readonly<Partial<Record<string, number>>> | undefined;
  readonly detail?: Readonly<Record<string, string | number | boolean>> | undefined;
  readonly correlationId: string;
}): KnowledgeRecord => {
  if (!isFiniteMs(input.observedAt)) {
    throw new KnowledgeValidationError(`invalid observedAt: ${input.observedAt}`);
  }
  if (input.expiresAt !== undefined) {
    if (!isFiniteMs(input.expiresAt)) {
      throw new KnowledgeValidationError(`invalid expiresAt: ${input.expiresAt}`);
    }
    if (Date.parse(input.expiresAt) <= Date.parse(input.observedAt)) {
      throw new KnowledgeValidationError('expiresAt must be after observedAt');
    }
  }
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    throw new KnowledgeValidationError(`confidence must be within [0,1]: ${input.confidence}`);
  }
  if (input.halfLifeMs !== undefined && (!Number.isFinite(input.halfLifeMs) || input.halfLifeMs <= 0)) {
    throw new KnowledgeValidationError(`halfLifeMs must be > 0: ${input.halfLifeMs}`);
  }
  if (EXPIRY_REQUIRED && input.kind === 'prediction' && input.expiresAt === undefined) {
    throw new KnowledgeValidationError('prediction knowledge must declare expiresAt');
  }
  for (const [objective, value] of Object.entries(input.objectiveEvidence ?? {})) {
    if (!Number.isFinite(value)) {
      throw new KnowledgeValidationError(`objectiveEvidence.${objective} must be finite`);
    }
  }
  const objectiveEvidence = input.objectiveEvidence
    ? Object.freeze(
        Object.fromEntries(
          Object.entries(input.objectiveEvidence).map(([objective, value]) => [
            objective,
            clamp01(value as number),
          ]),
        ),
      )
    : undefined;

  return deepFreeze({
    id: nextId('knowledge'),
    schemaVersion: 1,
    createdAt: nowIso(),
    correlationId: input.correlationId,
    // `AuditFields.source` and `KnowledgeRecord.source` are the same value: the
    // evidence family that produced the knowledge.
    source: input.provenance.source,
    metadata: Object.freeze({
      knowledgeKind: input.kind,
      advisoryOnly: isAdvisoryOnly(input.provenance.source),
    }),
    // `kind` is declared once for the narrowed literal; `source` above already
    // satisfies both `AuditFields.source` and `KnowledgeRecord.source`.
    kind: input.kind,
    provenance: Object.freeze({ ...input.provenance }),
    scope: Object.freeze({ ...(input.scope ?? {}) }),
    observedAt: input.observedAt,
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    ...(input.halfLifeMs !== undefined ? { halfLifeMs: input.halfLifeMs } : {}),
    confidence: clamp01(input.confidence),
    corroborations: Object.freeze([...(input.corroborations ?? [])]),
    ...(objectiveEvidence !== undefined ? { objectiveEvidence } : {}),
    ...(input.detail !== undefined ? { detail: Object.freeze({ ...input.detail }) } : {}),
  });
};

/**
 * Time-decayed confidence. Records lose confidence exponentially as they age
 * toward their expiry, and are rejected once expired.
 */
export const decayedConfidence = (
  record: KnowledgeRecord,
  nowMs: number = Date.now(),
): number => {
  const observedMs = Date.parse(record.observedAt);
  if (!Number.isFinite(observedMs)) return 0;
  if (record.expiresAt !== undefined && nowMs >= Date.parse(record.expiresAt)) return 0;
  if (record.halfLifeMs === undefined) return record.confidence;
  const ageMs = Math.max(0, nowMs - observedMs);
  if (ageMs === 0) return record.confidence;
  const decay = Math.pow(0.5, ageMs / record.halfLifeMs);
  return record.confidence * decay;
};

export const isExpired = (record: KnowledgeRecord, nowMs: number = Date.now()): boolean =>
  record.expiresAt !== undefined && nowMs >= Date.parse(record.expiresAt);

/**
 * Destination/provider scope match. An unscoped record matches any scope;
 * a scoped record matches only when every declared field agrees. This is the
 * guard that stops one destination's federated evidence from steering another.
 */
export const scopeMatches = (
  record: KnowledgeScope,
  active: KnowledgeScope,
): boolean => {
  const fields = ['destination', 'providerId', 'pathId', 'region'] as const;
  for (const field of fields) {
    const declared = record[field];
    if (declared === undefined) continue;
    if (declared !== active[field]) return false;
  }
  return true;
};
