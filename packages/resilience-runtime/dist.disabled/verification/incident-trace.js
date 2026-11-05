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
import { PIPELINE_STAGES, validateEvent } from '../events/event-taxonomy.js';
const stageIndex = (stage) => PIPELINE_STAGES.indexOf(stage);
/**
 * Rebuilds the trace for one correlation id from a local event log.
 *
 * `log` may be unsorted and may contain several decisions and transactions; both
 * fork correctly because identity fields, not arrival order, define the chain.
 */
export const reconstructTrace = (log, correlationId) => {
    const chain = log
        .filter((event) => event.correlationId === correlationId)
        .sort((a, b) => {
        const byTime = Date.parse(a.at) - Date.parse(b.at);
        if (Number.isFinite(byTime) && byTime !== 0)
            return byTime;
        return stageIndex(a.stage) - stageIndex(b.stage);
    });
    const gaps = [];
    const seen = new Set();
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
        if (event.stage !== 'recovery')
            previous = Math.max(previous, index);
    }
    const stagesMissing = PIPELINE_STAGES.filter((stage) => !seen.has(stage) && stage !== 'recovery' && stage !== 'candidate');
    for (const stage of stagesMissing) {
        gaps.push({ stage, reason: 'missing-stage', detail: `no event observed for stage '${stage}'` });
    }
    const decisionIds = [...new Set(chain.map((e) => e.decisionId).filter((v) => v !== undefined))].sort();
    const transactionIds = [
        ...new Set(chain.map((e) => e.transactionId).filter((v) => v !== undefined)),
    ].sort();
    const stagesObserved = PIPELINE_STAGES.filter((stage) => seen.has(stage));
    const complete = gaps.length === 0 && stagesMissing.length === 0 && decisionIds.length > 0;
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
export const traceEvent = (input) => {
    const payload = {
        ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
        ...(input.transactionId !== undefined ? { transactionId: input.transactionId } : {}),
        ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
        ...(input.payload ?? {}),
    };
    const validation = validateEvent(input.type, payload);
    if (!validation.valid)
        return { error: validation.reasons };
    return deepFreeze({
        type: input.type,
        stage: validation.stage,
        schemaVersion: 1,
        at: input.at ??
            new Date(input.nowMs ?? Date.now()).toISOString(),
        correlationId: input.correlationId,
        ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
        ...(input.transactionId !== undefined ? { transactionId: input.transactionId } : {}),
        payload: Object.freeze({ ...(input.payload ?? {}) }),
    });
};
//# sourceMappingURL=incident-trace.js.map