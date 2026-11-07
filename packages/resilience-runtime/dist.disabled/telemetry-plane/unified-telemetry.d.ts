/**
 * Phase 100 — Unified Telemetry Plane.
 *
 * One normalized record schema for observations, metrics, events and spans, a
 * scope model (tenant, device, resource) and a bounded local record store. It
 * reuses the existing telemetry classification registry and `SecretSentry`
 * redaction; it does not replace `TelemetrySink` or `EvidencePreservingEventSink`.
 */
import type { Observation } from '../domain/types.js';
import { type TelemetryClass } from '../events/evidence-sink.js';
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
export declare class TelemetryValidationError extends Error {
    constructor(message: string);
}
/** Validates and normalizes one input into the canonical record. Labels are redacted and stringified. */
export declare const normalizeTelemetry: (input: TelemetryInput) => TelemetryRecord;
/** Maps a runtime observation onto the unified schema. */
export declare const telemetryFromObservation: (o: Observation, scope?: TelemetryScope) => TelemetryRecord;
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
export declare class TelemetryRecordStore {
    readonly capacity: number;
    private records;
    private evicted;
    constructor(capacity?: number);
    append(input: TelemetryInput | TelemetryRecord): TelemetryRecord;
    get evictedCount(): number;
    get size(): number;
    query(q?: TelemetryQuery): readonly TelemetryRecord[];
}
//# sourceMappingURL=unified-telemetry.d.ts.map