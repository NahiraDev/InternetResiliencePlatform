/**
 * Phase 100 — Unified Telemetry Plane.
 *
 * One normalized record schema for observations, metrics, events and spans, a
 * scope model (tenant, device, resource) and a bounded local record store. It
 * reuses the existing telemetry classification registry and `SecretSentry`
 * redaction; it does not replace `TelemetrySink` or `EvidencePreservingEventSink`.
 */

import { stableId } from '../domain/ids.js';
import type { Observation } from '../domain/types.js';
import { classificationFor, type TelemetryClass } from '../events/evidence-sink.js';
import { SecretSentry } from '../security/secrets.js';
import { parseTime } from '../analytics/series.js';

export type TelemetryKind = 'metric' | 'event' | 'observation' | 'span';

export interface TelemetryScope {
  readonly tenantId?: string;
  readonly deviceId?: string;
  readonly resourceId?: string;
  readonly layer?: string;
}

export interface TelemetryRecord {
  readonly id: string;
  readonly kind: TelemetryKind;
  readonly name: string;
  readonly at: string;
  readonly atMs: number;
  readonly value?: number;
  readonly unit?: string;
  readonly source: string;
  readonly scope: TelemetryScope;
  readonly telemetryClass: TelemetryClass;
  readonly correlationId?: string;
  readonly labels: Readonly<Record<string, string>>;
}

export interface TelemetryInput {
  readonly kind: TelemetryKind;
  readonly name: string;
  readonly at: string;
  readonly value?: number;
  readonly unit?: string;
  readonly source: string;
  readonly scope?: TelemetryScope;
  readonly correlationId?: string;
  readonly labels?: Readonly<Record<string, unknown>>;
}

const sentry = new SecretSentry();
const NAME = /^[a-z][a-z0-9_.:-]{0,127}$/;

export class TelemetryValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'TelemetryValidationError'; }
}

/** Validates and normalizes one input into the canonical record. Labels are redacted and stringified. */
export const normalizeTelemetry = (input: TelemetryInput): TelemetryRecord => {
  if (!NAME.test(input.name)) throw new TelemetryValidationError(`invalid telemetry name: ${input.name}`);
  const atMs = parseTime(input.at);
  if (!Number.isFinite(atMs)) throw new TelemetryValidationError('invalid telemetry timestamp');
  if (input.value !== undefined && !Number.isFinite(input.value)) throw new TelemetryValidationError('telemetry value must be finite');
  if (!input.source.trim()) throw new TelemetryValidationError('telemetry source is required');
  const registered = classificationFor(input.name);
  const redacted = sentry.redact(input.labels ?? {}, 'telemetry').value as Record<string, unknown>;
  const labels = Object.fromEntries(Object.entries(redacted).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]).sort(([a], [b]) => (a as string).localeCompare(b as string)));
  const scope = Object.freeze({ ...(input.scope ?? {}) });
  return Object.freeze({
    id: stableId('tel', `${input.kind}|${input.name}|${input.at}|${input.source}|${scope.resourceId ?? ''}|${scope.deviceId ?? ''}|${input.correlationId ?? ''}`),
    kind: input.kind, name: input.name, at: input.at, atMs,
    ...(input.value !== undefined ? { value: input.value } : {}),
    ...(input.unit ? { unit: input.unit } : {}),
    source: input.source, scope,
    telemetryClass: registered?.telemetryClass ?? 'diagnostic',
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    labels: Object.freeze(labels) as Readonly<Record<string, string>>,
  });
};

/** Maps a runtime observation onto the unified schema. */
export const telemetryFromObservation = (o: Observation, scope: TelemetryScope = {}): TelemetryRecord =>
  normalizeTelemetry({
    kind: 'observation', name: `observation.${o.category}.${o.metric}`.toLowerCase().replace(/[^a-z0-9_.:-]/g, '_'),
    at: o.timestamp, ...(typeof o.value === 'number' && Number.isFinite(o.value) ? { value: o.value } : {}),
    ...(o.unit ? { unit: o.unit } : {}), source: o.source, scope, ...(o.correlationId ? { correlationId: o.correlationId } : {}),
    labels: { status: o.status, severity: o.severity, confidence: o.confidence },
  });

export interface TelemetryQuery {
  readonly name?: string;
  readonly namePrefix?: string;
  readonly kind?: TelemetryKind;
  readonly scope?: TelemetryScope;
  readonly correlationId?: string;
  readonly fromMs?: number;
  readonly toMs?: number;
  readonly telemetryClass?: TelemetryClass;
  readonly limit?: number;
}

/** Bounded local record store; oldest records are evicted first and counted. */
export class TelemetryRecordStore {
  private records: TelemetryRecord[] = [];
  private evicted = 0;
  constructor(readonly capacity = 10_000) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('telemetry store capacity must be a positive integer');
  }
  append(input: TelemetryInput | TelemetryRecord): TelemetryRecord {
    const record = 'atMs' in input ? input : normalizeTelemetry(input);
    this.records.push(record);
    this.records.sort((a, b) => a.atMs - b.atMs || a.id.localeCompare(b.id));
    while (this.records.length > this.capacity) { this.records.shift(); this.evicted += 1; }
    return record;
  }
  get evictedCount(): number { return this.evicted; }
  get size(): number { return this.records.length; }
  query(q: TelemetryQuery = {}): readonly TelemetryRecord[] {
    const out = this.records.filter((r) => {
      if (q.name && r.name !== q.name) return false;
      if (q.namePrefix && !r.name.startsWith(q.namePrefix)) return false;
      if (q.kind && r.kind !== q.kind) return false;
      if (q.correlationId && r.correlationId !== q.correlationId) return false;
      if (q.telemetryClass && r.telemetryClass !== q.telemetryClass) return false;
      if (q.fromMs !== undefined && r.atMs < q.fromMs) return false;
      if (q.toMs !== undefined && r.atMs > q.toMs) return false;
      if (q.scope) for (const [k, v] of Object.entries(q.scope)) if (r.scope[k as keyof TelemetryScope] !== v) return false;
      return true;
    });
    return Object.freeze(q.limit !== undefined ? out.slice(-q.limit) : out);
  }
}
