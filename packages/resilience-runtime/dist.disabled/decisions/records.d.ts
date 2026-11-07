import type { DecisionRecord, DecisionOutcome, RuntimeContext, RuntimeState, ObservationBatch, Incident, CandidateAction, ActionPlan, ActionValidation, ActionExecution, ActionVerification, RecoveryPlan } from '../domain/types.js';
export declare const redact: (value: unknown) => unknown;
export declare const createDecisionRecord: (input: {
    context: RuntimeContext;
    before: RuntimeState;
    after: RuntimeState;
    observations: ObservationBatch;
    incidents: readonly Incident[];
    policyEvaluation: DecisionRecord["policyEvaluation"];
    candidates: readonly CandidateAction[];
    selectedPlan?: ActionPlan | undefined;
    validation?: ActionValidation | undefined;
    executionResult?: ActionExecution | undefined;
    verificationResult?: ActionVerification | undefined;
    recoveryResult?: RecoveryPlan | undefined;
    outcome: DecisionOutcome;
    confidence: number;
    durationMs: number;
}) => DecisionRecord;
//# sourceMappingURL=records.d.ts.map