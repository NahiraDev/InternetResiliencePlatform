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

import { deepFreeze } from '../domain/ids.js';
import type { EventSink, TelemetrySink } from '../ports/ports.js';
import { SecretSentry } from '../security/secrets.js';
import { traceEvent, type TraceEvent } from '../verification/incident-trace.js';
import { validateEvent } from './event-taxonomy.js';

/** Telemetry sensitivity classes (task 8). */
export const TELEMETRY_CLASSES = ['operational', 'diagnostic', 'security', 'analytical'] as const;
export type TelemetryClass = (typeof TELEMETRY_CLASSES)[number];

export interface TelemetryClassification {
  readonly metric: string;
  readonly telemetryClass: TelemetryClass;
  /** True when the metric must never contain identity or payload data. */
  readonly aggregateOnly: boolean;
  readonly description: string;
}

const defineTelemetry = (
  metric: string,
  telemetryClass: TelemetryClass,
  aggregateOnly: boolean,
  description: string,
): TelemetryClassification =>
  Object.freeze({ metric, telemetryClass, aggregateOnly, description });

/**
 * Metrics that may be exported. Aggregate-only metrics carry counts and
 * durations, never identifiers or payloads.
 */
export const TELEMETRY_CLASSIFICATIONS: readonly TelemetryClassification[] = Object.freeze([
  defineTelemetry('runtime_cycles_total', 'operational', true, 'Control cycles started.'),
  defineTelemetry('runtime_cycles_failed_total', 'operational', true, 'Control cycles that failed.'),
  defineTelemetry('runtime_decisions_total', 'operational', true, 'Decisions recorded.'),
  defineTelemetry('runtime_actions_total', 'operational', true, 'Mutations attempted.'),
  defineTelemetry('runtime_actions_failed_total', 'operational', true, 'Mutations that failed.'),
  defineTelemetry('runtime_verifications_failed_total', 'operational', true, 'Verifications that failed.'),
  defineTelemetry('runtime_recoveries_total', 'operational', true, 'Recoveries performed.'),
  defineTelemetry('runtime_rollbacks_total', 'operational', true, 'Rollbacks performed.'),
  defineTelemetry('runtime_blocked_total', 'operational', true, 'Mutations blocked by a gate.'),
  defineTelemetry('runtime_degraded_total', 'operational', true, 'Degraded-mode transitions.'),
  defineTelemetry('runtime_cycle_duration', 'diagnostic', true, 'Cycle duration distribution.'),
  defineTelemetry('runtime_decision_confidence', 'diagnostic', true, 'Decision confidence distribution.'),
  defineTelemetry('runtime_observation_staleness', 'diagnostic', true, 'Observation staleness distribution.'),
  defineTelemetry('runtime_telemetry_failures_total', 'diagnostic', true, 'Telemetry export failures observed locally.'),
  defineTelemetry('runtime_telemetry_redactions_total', 'diagnostic', true, 'Secret redactions performed before retention or export.'),
  defineTelemetry('runtime_event_invalid_total', 'diagnostic', true, 'Events retained without satisfying taxonomy validation.'),
  defineTelemetry('runtime_event_export_failures_total', 'diagnostic', true, 'Event export failures observed locally.'),
  defineTelemetry('runtime_persistence_failures_total', 'diagnostic', true, 'Persistence failures observed locally.'),
  defineTelemetry('runtime_policy_denied_total', 'security', true, 'Policy denials by reason class.'),
]);

export const classificationFor = (metric: string): TelemetryClassification | undefined =>
  TELEMETRY_CLASSIFICATIONS.find((entry) => entry.metric === metric);

export const isRegisteredTelemetry = (metric: string): boolean =>
  classificationFor(metric) !== undefined;

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
export class EvidencePreservingEventSink implements EventSink {
  private readonly local: ExportedEvent[] = [];
  private readonly traces: TraceEvent[] = [];
  private readonly sentry: SecretSentry;
  private readonly maxLocalEvents: number;
  private readonly maxTraces: number;
  private readonly now: () => number;
  private readonly rejectInvalid: boolean;
  private dropped = 0;
  private invalid = 0;
  private readonly invalidReasonList: string[] = [];

  constructor(private readonly options: EvidenceSinkOptions = {}) {
    this.sentry = options.sentry ?? new SecretSentry();
    this.maxLocalEvents = Math.max(1, options.maxLocalEvents ?? 1000);
    this.maxTraces = Math.max(1, options.maxTraces ?? 1000);
    this.now = options.nowMs ?? (() => Date.now());
    this.rejectInvalid = options.rejectInvalidEvents ?? false;
  }

  async emit(event: string, payload: Readonly<Record<string, unknown>>): Promise<void> {
    const { value, report } = this.sentry.redact(payload, 'decision-record');

    const validation = validateEvent(event, value as Record<string, unknown>);
    if (!validation.valid) {
      this.invalid += 1;
      this.invalidReasonList.push(...validation.reasons);
      this.count('runtime_event_invalid_total');
      if (this.rejectInvalid) {
        this.dropped += 1;
        return;
      }
      // Fall through: the event is still retained and exported. An event that
      // does not satisfy the taxonomy is a defect to surface, not evidence to
      // destroy, and dropping it would break incident reconstruction.
    } else {
      // A valid taxonomy event is also retained as a trace event when it carries
      // a correlation id, which is what makes reconstruction possible.
      const correlationId = (value as Record<string, unknown>)['correlationId'];
      if (typeof correlationId === 'string') {
        const built = traceEvent({
          type: event,
          correlationId,
          at: new Date(this.now()).toISOString(),
          ...(typeof (value as Record<string, unknown>)['decisionId'] === 'string'
            ? { decisionId: (value as Record<string, unknown>)['decisionId'] as string }
            : {}),
          ...(typeof (value as Record<string, unknown>)['transactionId'] === 'string'
            ? { transactionId: (value as Record<string, unknown>)['transactionId'] as string }
            : {}),
          payload: value as Record<string, unknown>,
          nowMs: this.now(),
        });
        if (!('error' in built)) {
          this.traces.push(built as TraceEvent);
          while (this.traces.length > this.maxTraces) this.traces.shift();
        }
      }
    }

    // Retain locally first: an exporter failure must never lose evidence.
    const retained: ExportedEvent = Object.freeze({
      event,
      payload: Object.freeze({ ...(value as Record<string, unknown>) }),
    });
    this.local.push(retained);
    while (this.local.length > this.maxLocalEvents) this.local.shift();

    void report;
    if (report.redactedKeys > 0 || report.redactedValues > 0) {
      this.count('runtime_telemetry_redactions_total');
    }

    const external = this.options.external;
    if (!external) return;
    try {
      await external.exportEvent(retained);
    } catch {
      // Export is optional infrastructure. Failure is evidence, not a
      // control-loop failure, and the local copy above is already retained.
      this.count('runtime_event_export_failures_total');
    }
  }

  private count(metric: string): void {
    try {
      this.options.telemetry?.increment(metric);
    } catch {
      // Telemetry is optional too. Never propagate.
    }
  }

  /**
   * Local evidence, redacted, newest last.
   *
   * Exposed as a property (not a method) returning a frozen copy so existing
   * consumers of `InMemoryEventSink.events` keep working unchanged. The copy
   * prevents callers from mutating the authoritative log.
   */
  get events(): readonly ExportedEvent[] {
    return Object.freeze([...this.local]);
  }

  /** Local trace events, for incident reconstruction. */
  traceEvents(): readonly TraceEvent[] {
    return Object.freeze([...this.traces]);
  }

  droppedInvalid(): number {
    return this.dropped;
  }

  /** Events retained but not satisfying the taxonomy. Never dropped by default. */
  invalidCount(): number {
    return this.invalid;
  }

  invalidReasons(): readonly string[] {
    return Object.freeze([...this.invalidReasonList]);
  }

  snapshot(): {
    readonly events: number;
    readonly traces: number;
    readonly invalid: number;
    readonly dropped: number;
  } {
    return Object.freeze({
      events: this.local.length,
      traces: this.traces.length,
      invalid: this.invalid,
      dropped: this.dropped,
    });
  }
}

/**
 * Telemetry sink that refuses unregistered metrics and never accepts payload
 * values, so an identifier cannot be smuggled in as a "metric".
 */
export class ClassifiedTelemetrySink implements TelemetrySink {
  private readonly values = new Map<string, number>();
  private rejected = 0;

  constructor(
    private readonly local?: TelemetrySink,
    private readonly nowMs: () => number = () => Date.now(),
  ) {}

  increment(metric: string, value = 1): void {
    if (!isRegisteredTelemetry(metric)) {
      this.rejected += 1;
      return;
    }
    const current = this.values.get(metric) ?? 0;
    this.values.set(metric, current + (Number.isFinite(value) ? value : 0));
    this.forward(() => this.local?.increment(metric, value));
  }

  observe(metric: string, value: number): void {
    if (!isRegisteredTelemetry(metric)) {
      this.rejected += 1;
      return;
    }
    this.values.set(metric, Number.isFinite(value) ? value : 0);
    this.forward(() => this.local?.observe(metric, value));
  }

  private forward(write: () => void): void {
    try {
      write();
    } catch {
      const current = this.values.get('runtime_telemetry_failures_total') ?? 0;
      this.values.set('runtime_telemetry_failures_total', current + 1);
    }
  }

  rejectedMetrics(): number {
    return this.rejected;
  }

  snapshot(): Readonly<Record<string, number>> {
    return Object.freeze(Object.fromEntries(this.values));
  }

  /** Snapshot is time-independent by construction; accepted for symmetry. */
  observeAt(): number {
    return this.nowMs();
  }
}

export const TELEMETRY_SNAPSHOT = deepFreeze({
  metrics: TELEMETRY_CLASSIFICATIONS.map((entry) => entry.metric),
  classes: TELEMETRY_CLASSES,
});