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
}

export const explainDecision = (record: DecisionRecord): DecisionExplanation => {
  const securityIncidents = record.incidents.filter(
    (incident) => incident.classification === 'security_failure',
  );
  const failureDomain = [
    ...new Set(record.incidents.flatMap((incident) => incident.affectedComponents)),
  ].sort();
  return Object.freeze({
    decisionId: record.decisionId,
    intent: record.selectedPlan?.selectedAction.intent ?? null,
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
    recoveryState: record.recoveryResult?.status ?? record.verificationResult?.status ?? 'none',
    explanation: record.explanation,
  });
};
