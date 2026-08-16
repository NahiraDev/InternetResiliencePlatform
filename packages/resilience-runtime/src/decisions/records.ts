import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
import type {
  DecisionRecord,
  DecisionOutcome,
  RuntimeContext,
  RuntimeState,
  ObservationBatch,
  Incident,
  CandidateAction,
  ActionPlan,
  ActionValidation,
  ActionExecution,
  ActionVerification,
  RecoveryPlan,
} from '../domain/types.js';
const secretKeys = ['password', 'secret', 'token', 'privateKey', 'accessToken', 'credential'];
export const redact = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        secretKeys.some((s) => k.toLowerCase().includes(s.toLowerCase()))
          ? '[REDACTED]'
          : redact(v),
      ]),
    );
  return value;
};
export const createDecisionRecord = (input: {
  context: RuntimeContext;
  before: RuntimeState;
  after: RuntimeState;
  observations: ObservationBatch;
  incidents: readonly Incident[];
  policyEvaluation: DecisionRecord['policyEvaluation'];
  candidates: readonly CandidateAction[];
  selectedPlan?: ActionPlan | undefined;
  validation?: ActionValidation | undefined;
  executionResult?: ActionExecution | undefined;
  verificationResult?: ActionVerification | undefined;
  recoveryResult?: RecoveryPlan | undefined;
  outcome: DecisionOutcome;
  confidence: number;
  durationMs: number;
}): DecisionRecord =>
  deepFreeze(
    redact({
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
        deadline: input.context.deadline,
        configuration: input.context.configuration,
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
    }) as DecisionRecord,
  );
