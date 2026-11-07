/**
 * Evidence-preserving event sink and telemetry classification for issue #281
 * (issue #272 Section J, tasks 6 and 8).
 *
 * Task 6: an exporter or collector failure must never lose local evidence. The
 * local log is authoritative; the external sink is best-effort.
 *
 * Task 8: telemetry is classified by sensitivity, and secrets/private payloads
 * never reach it. The pre-existing `InMemoryEventSink` pushed payloads verbatim
 * with no redaction and no failure isolation.
 */
import type { EventSink, TelemetrySink } from '../ports/ports.js';
import { SecretSentry } from '../security/secrets.js';
import { type TraceEvent } from '../verification/incident-trace.js';
/** Telemetry sensitivity classes (task 8). */
export declare const TELEMETRY_CLASSES: readonly ["operational", "diagnostic", "security", "analytical"];
export type TelemetryClass = (typeof TELEMETRY_CLASSES)[number];
export interface TelemetryClassification {
    readonly metric: string;
    readonly telemetryClass: TelemetryClass;
    /** True when the metric must never contain identity or payload data. */
    readonly aggregateOnly: boolean;
    readonly description: string;
}
/**
 * Metrics that may be exported. Aggregate-only metrics carry counts and
 * durations, never identifiers or payloads.
 */
export declare const TELEMETRY_CLASSIFICATIONS: readonly TelemetryClassification[];
export declare const classificationFor: (metric: string) => TelemetryClassification | undefined;
export declare const isRegisteredTelemetry: (metric: string) => boolean;
export interface ExportedEvent {
    readonly event: string;
    readonly payload: Readonly<Record<string, unknown>>;
}
export interface EvidenceExporter {
    exportEvent(event: ExportedEvent): void | Promise<void>;
}
export interface EvidenceSinkOptions {
    readonly external?: EvidenceExporter;
    readonly telemetry?: TelemetrySink;
    readonly sentry?: SecretSentry;
    /** Maximum retained local events. Oldest are evicted first. */
    readonly maxLocalEvents?: number;
    /** Maximum retained local trace events for reconstruction. */
    readonly maxTraces?: number;
    readonly nowMs?: () => number;
    /**
     * When true, events that fail taxonomy validation are discarded instead of
     * retained. Defaults to **false**: losing evidence is never acceptable, so an
     * invalid event is annotated and counted, not dropped.
     */
    readonly rejectInvalidEvents?: boolean;
}
/**
 * The authoritative local evidence sink.
 *
 * Guarantees, in order:
 *  1. the event is retained locally **before** any export is attempted;
 *  2. export failure is counted and swallowed — it never propagates to the
 *     control loop;
 *  3. payloads are redacted before both retention and export;
 *  4. events failing taxonomy validation are annotated and counted by default;
 *     they are discarded only when `rejectInvalidEvents` is explicitly enabled.
 */
export declare class EvidencePreservingEventSink implements EventSink {
    private readonly options;
    private readonly local;
    private readonly traces;
    private readonly sentry;
    private readonly maxLocalEvents;
    private readonly maxTraces;
    private readonly now;
    private readonly rejectInvalid;
    private dropped;
    private invalid;
    private readonly invalidReasonList;
    constructor(options?: EvidenceSinkOptions);
    emit(event: string, payload: Readonly<Record<string, unknown>>): Promise<void>;
    private count;
    /**
     * Local evidence, redacted, newest last.
     *
     * Exposed as a property (not a method) returning a frozen copy so existing
     * consumers of `InMemoryEventSink.events` keep working unchanged. The copy
     * prevents callers from mutating the authoritative log.
     */
    get events(): readonly ExportedEvent[];
    /** Local trace events, for incident reconstruction. */
    traceEvents(): readonly TraceEvent[];
    droppedInvalid(): number;
    /** Events retained but not satisfying the taxonomy. Never dropped by default. */
    invalidCount(): number;
    invalidReasons(): readonly string[];
    snapshot(): {
        readonly events: number;
        readonly traces: number;
        readonly invalid: number;
        readonly dropped: number;
    };
}
/**
 * Telemetry sink that refuses unregistered metrics and never accepts payload
 * values, so an identifier cannot be smuggled in as a "metric".
 */
export declare class ClassifiedTelemetrySink implements TelemetrySink {
    private readonly local?;
    private readonly nowMs;
    private readonly values;
    private rejected;
    constructor(local?: TelemetrySink | undefined, nowMs?: () => number);
    increment(metric: string, value?: number): void;
    observe(metric: string, value: number): void;
    private forward;
    rejectedMetrics(): number;
    snapshot(): Readonly<Record<string, number>>;
    /** Snapshot is time-independent by construction; accepted for symmetry. */
    observeAt(): number;
}
//# sourceMappingURL=evidence-sink.d.ts.map