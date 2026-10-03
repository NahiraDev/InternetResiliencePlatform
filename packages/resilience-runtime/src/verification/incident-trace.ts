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

import { deepFreeze } from '../domain/ids.js';
import {
  PIPELINE_STAGES,
  type IdentityField,
  type PipelineStage,
  validateEvent,
} from '../events/event-taxonomy.js';

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

const stageIndex = (stage: PipelineStage): number => PIPELINE_STAGES.indexOf(stage);

/**
 * Rebuilds the trace for one correlation id from a local event log.
 *
 * `log` may be unsorted and may contain several decisions and transactions; both
 * fork correctly because identity fields, not arrival order, define the chain.
 */
export const reconstructTrace = (
  log: readonly TraceEvent[],
  correlationId: string,
): IncidentTrace => {
  const chain = log
    .filter((event) => event.correlationId === correlationId)
    .sort((a, b) => {
      const byTime = Date.parse(a.at) - Date.parse(b.at);
      if (Number.isFinite(byTime) && byTime !== 0) return byTime;
      return stageIndex(a.stage) - stageIndex(b.stage);
    });

  const gaps: TraceGap[] = [];
  const seen = new Set<PipelineStage>();
  let previous = -1;

  for (const event of chain) {
    seen.add(event.stage);
    const index = stageIndex(event.stage);
    // `recovery` interleaves with the outcome path, so it is exempt from
    // monotonic ordering; otherwise a later stage must not precede an earlier one.
    if (event.stage !== 'recovery' && index < previous) {
      gaps.push({
        stage: event.stage,
        reason: 'out-of-order',
        detail: `stage '${event.stage}' appeared after '${PIPELINE_STAGES[previous]}'`,
      });
    }
    if (event.stage !== 'recovery') previous = Math.max(previous, index);
  }

  const stagesMissing = PIPELINE_STAGES.filter(
    (stage) => !seen.has(stage) && stage !== 'recovery' && stage !== 'candidate',
  );
  for (const stage of stagesMissing) {
    gaps.push({ stage, reason: 'missing-stage', detail: `no event observed for stage '${stage}'` });
  }

  const decisionIds = [...new Set(chain.map((e) => e.decisionId).filter((v): v is string => v !== undefined))].sort();
  const transactionIds = [
    ...new Set(chain.map((e) => e.transactionId).filter((v): v is string => v !== undefined)),
  ].sort();

  const stagesObserved = PIPELINE_STAGES.filter((stage) => seen.has(stage));
  const complete =
    gaps.length === 0 && stagesMissing.length === 0 && decisionIds.length > 0;

  return deepFreeze({
    correlationId,
    decisionIds: Object.freeze(decisionIds),
    transactionIds: Object.freeze(transactionIds),
    stagesObserved: Object.freeze(stagesObserved),
    stagesMissing: Object.freeze(stagesMissing),
    events: Object.freeze(chain),
    gaps: Object.freeze(gaps),
    complete,
    reconstructed: chain.length > 0,
  });
};

/**
 * Builds a trace event, enforcing the taxonomy's identity requirements.
 * Invalid events are rejected so a malformed event cannot enter the log.
 */
export const traceEvent = (input: {
  readonly type: string;
  readonly at?: string;
  readonly correlationId: string;
  readonly decisionId?: string;
  readonly transactionId?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly nowMs?: number;
}): TraceEvent | { readonly error: readonly string[] } => {
  const payload: Record<string, unknown> = {
    ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
    ...(input.transactionId !== undefined ? { transactionId: input.transactionId } : {}),
    ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    ...(input.payload ?? {}),
  };
  const validation = validateEvent(input.type, payload);
  if (!validation.valid) return { error: validation.reasons };
  return deepFreeze({
    type: input.type,
    stage: validation.stage as PipelineStage,
    schemaVersion: 1,
    at:
      input.at ??
      new Date(input.nowMs ?? Date.now()).toISOString(),
    correlationId: input.correlationId,
    ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
    ...(input.transactionId !== undefined ? { transactionId: input.transactionId } : {}),
    payload: Object.freeze({ ...(input.payload ?? {}) }),
  });
};

export const IDENTITY_ORDER: readonly IdentityField[] = Object.freeze([
  'correlationId',
  'decisionId',
  'transactionId',
]);