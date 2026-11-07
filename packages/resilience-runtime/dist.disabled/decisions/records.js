import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
const secretKeys = ['password', 'secret', 'token', 'privateKey', 'accessToken', 'credential'];
export const redact = (value) => {
    if (Array.isArray(value))
        return value.map(redact);
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [
            k,
            secretKeys.some((s) => k.toLowerCase().includes(s.toLowerCase()))
                ? '[REDACTED]'
                : redact(v),
        ]));
    return value;
};
export const createDecisionRecord = (input) => deepFreeze(redact({
    id: nextId('record'),
    decisionId: nextId('decision'),
    schemaVersion: 1,
    createdAt: nowIso(),
    correlationId: input.context.correlationId,
    source: 'resilience-runtime',
    metadata: {},
    runtimeStateBefore: input.before,
    runtimeStateAfter: input.after,
    runtimeContext: {
        runtimeId: input.context.runtimeId,
        correlationId: input.context.correlationId,
        mode: input.context.mode,
        // A decision record is also the runtime's durable explainability and
        // replay boundary. Preserve the exact policy/capability snapshots that
        // admitted the action rather than reconstructing contemporary defaults.
        policySnapshot: input.context.policySnapshot,
        capabilitySnapshot: input.context.capabilitySnapshot,
        deadline: input.context.deadline,
        configuration: input.context.configuration,
        compiledIntent: input.context.compiledIntent,
        // Preserve all submitted intents, not only the arbitrated winner, so
        // replay and audit consumers can reconstruct priority, scope, and
        // lifecycle conflict handling from the canonical decision record.
        compiledIntents: input.context.compiledIntents,
    },
    observations: input.observations,
    incidents: input.incidents,
    policyEvaluation: input.policyEvaluation,
    candidates: input.candidates,
    selectedPlan: input.selectedPlan,
    validation: input.validation,
    executionResult: input.executionResult,
    verificationResult: input.verificationResult,
    recoveryResult: input.recoveryResult,
    outcome: input.outcome,
    confidence: input.confidence,
    durationMs: input.durationMs,
    explanation: [
        `Outcome ${input.outcome}`,
        `Selected ${input.selectedPlan?.selectedAction.intent ?? 'none'}`,
        `Policy ${input.policyEvaluation.allowed ? 'allowed' : 'rejected'}`,
    ],
}));
//# sourceMappingURL=records.js.map