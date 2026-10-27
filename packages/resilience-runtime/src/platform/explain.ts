/**
 * Read-only decision explanation surface for issue #280.
 * Cockpit/API/CLI/mobile/desktop consume this view for observability and
 * expert control. It carries no mutation authority: decisions, constraints,
 * path, health, confidence, failure domain, security posture and recovery
 * state are projected from an already-produced canonical DecisionRecord.
 */

import type { DecisionRecord } from '../domain/types.js';

export interface DecisionExplanation {
  readonly decisionId: string;
  readonly intent: string | null;
  readonly outcome: DecisionRecord['outcome'];
  readonly confidence: number;
  readonly mode: string;
  readonly constraints: {
    readonly allowedActions: readonly string[];
    readonly deniedActions: readonly string[];
    readonly requiredCapabilities: readonly string[];
    readonly policyReasons: readonly string[];
  };
  readonly path: { readonly from: string; readonly to: string };
  readonly health: 'healthy' | 'attention';
  readonly incidents: readonly {
    readonly rootCause: string;
    readonly classification: string;
  }[];
  readonly failureDomain: readonly string[];
  readonly securityPosture: 'clear' | 'failing-closed';
  readonly recoveryState: string;
  readonly explanation: readonly string[];
  /**
   * Why this candidate was chosen over the others, with the alternatives that
   * were rejected and the reason each was rejected.
   */
  readonly selection: {
    readonly selected: string;
    readonly expectedBenefit: number;
    readonly risk: number;
    /** Objective score and the intent-derived weights used to compute it. */
    readonly objectiveScore: number | null;
    readonly objectives: Readonly<Record<string, number>> | null;
    readonly alternatives: readonly {
      readonly intent: string;
      readonly rejectionReasons: readonly string[];
    }[];
  };
  /** Validation and safety guards that applied, including refusals. */
  readonly guards: {
    readonly validationValid: boolean | null;
    readonly validationReasons: readonly string[];
    readonly safetyApplied: boolean;
  };
  /** Verified and failed postconditions from outcome verification. */
  readonly verification: {
    readonly status: string | null;
    readonly verifiedPostconditions: readonly string[];
    readonly failedPostconditions: readonly string[];
  } | null;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

export const explainDecision = (record: DecisionRecord): DecisionExplanation => {
  const securityIncidents = record.incidents.filter(
    (incident) => incident.classification === 'security_failure',
  );
  const failureDomain = [
    ...new Set(record.incidents.flatMap((incident) => incident.affectedComponents)),
  ].sort();
  const plan = record.selectedPlan;
  const optimization = plan !== undefined && isRecord(plan.metadata.optimization)
    ? plan.metadata.optimization
    : undefined;
  const objectiveScore =
    optimization !== undefined && typeof optimization.objectiveScore === 'number'
      ? optimization.objectiveScore
      : null;
  const objectives =
    optimization !== undefined && isRecord(optimization.objectives)
      ? (Object.freeze({ ...optimization.objectives }) as Readonly<Record<string, number>>)
      : null;
  const verification = record.verificationResult;
  return Object.freeze({
    decisionId: record.decisionId,
    intent: plan?.selectedAction.intent ?? null,
    outcome: record.outcome,
    confidence: record.confidence,
    mode: record.runtimeContext.mode,
    constraints: {
      allowedActions: Object.freeze([
        ...record.runtimeContext.policySnapshot.policy.allowedActions,
      ]),
      deniedActions: Object.freeze([...record.runtimeContext.policySnapshot.policy.deniedActions]),
      requiredCapabilities: Object.freeze([...record.policyEvaluation.requiredCapabilities]),
      policyReasons: Object.freeze([...record.policyEvaluation.reasons]),
    },
    path: { from: record.runtimeStateBefore, to: record.runtimeStateAfter },
    health: record.outcome === 'success' || record.outcome === 'noop' ? 'healthy' : 'attention',
    incidents: Object.freeze(
      record.incidents.map((incident) => ({
        rootCause: incident.rootCause,
        classification: incident.classification,
      })),
    ),
    failureDomain: Object.freeze(failureDomain),
    securityPosture: securityIncidents.length > 0 ? 'failing-closed' : 'clear',
    recoveryState: record.recoveryResult?.status ?? verification?.status ?? 'none',
    explanation: record.explanation,
    selection: Object.freeze({
      selected: plan?.selectedAction.intent ?? 'none',
      expectedBenefit: plan?.expectedBenefit ?? 0,
      risk: plan?.risk ?? 0,
      objectiveScore,
      objectives,
      // Rejected alternatives are already annotated by the canonical planner, so
      // they are projected rather than recomputed here.
      alternatives: Object.freeze(
        (plan?.alternatives ?? []).map((alternative) => ({
          intent: alternative.intent,
          rejectionReasons: Object.freeze([...alternative.rejectionReasons]),
        })),
      ),
    }),
    guards: Object.freeze({
      validationValid: record.validation?.valid ?? null,
      validationReasons: Object.freeze([...(record.validation?.reasons ?? [])]),
      safetyApplied: record.executionResult !== undefined || record.verificationResult !== undefined,
    }),
    verification:
      verification === undefined
        ? null
        : Object.freeze({
            status: verification.status,
            verifiedPostconditions: Object.freeze([...verification.verifiedPostconditions]),
            failedPostconditions: Object.freeze([...verification.failedPostconditions]),
          }),
  });
};
