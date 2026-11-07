/**
 * End-to-end trace reconstruction for issue #281 (issue #272 Section J, task 5).
 *
 * Acceptance: "An autonomous incident can be reconstructed from local/runtime
 * evidence."
 *
 * A trace is rebuilt from a local event log by following identity semantics, not
 * by string-matching event names. Gaps in the causal chain are reported rather
 * than smoothed over, so a missing stage is visible as a defect.
 */
import { type PipelineStage } from '../events/event-taxonomy.js';
export interface TraceEvent {
    readonly type: string;
    readonly stage: PipelineStage;
    readonly schemaVersion: number;
    readonly at: string;
    readonly correlationId: string;
    readonly decisionId?: string;
    readonly transactionId?: string;
    readonly payload: Readonly<Record<string, unknown>>;
}
export interface TraceGap {
    readonly stage: PipelineStage;
    readonly reason: 'missing-stage' | 'out-of-order' | 'identity-mismatch';
    readonly detail: string;
}
export interface IncidentTrace {
    readonly correlationId: string;
    readonly decisionIds: readonly string[];
    readonly transactionIds: readonly string[];
    /** Stages observed, in pipeline order. */
    readonly stagesObserved: readonly PipelineStage[];
    /** Stages with no evidence. */
    readonly stagesMissing: readonly PipelineStage[];
    readonly events: readonly TraceEvent[];
    readonly gaps: readonly TraceGap[];
    /** True when the chain covers trigger through outcome with no gaps. */
    readonly complete: boolean;
    readonly reconstructed: boolean;
}
/**
 * Rebuilds the trace for one correlation id from a local event log.
 *
 * `log` may be unsorted and may contain several decisions and transactions; both
 * fork correctly because identity fields, not arrival order, define the chain.
 */
export declare const reconstructTrace: (log: readonly TraceEvent[], correlationId: string) => IncidentTrace;
/**
 * Builds a trace event, enforcing the taxonomy's identity requirements.
 * Invalid events are rejected so a malformed event cannot enter the log.
 */
export declare const traceEvent: (input: {
    readonly type: string;
    readonly at?: string;
    readonly correlationId: string;
    readonly decisionId?: string;
    readonly transactionId?: string;
    readonly payload?: Readonly<Record<string, unknown>>;
    readonly nowMs?: number;
}) => TraceEvent | {
    readonly error: readonly string[];
};
//# sourceMappingURL=incident-trace.d.ts.map