/**
 * Read-only decision explanation surface for issue #280.
 * Cockpit/API/CLI/mobile/desktop consume this view for observability and
 * expert control. It carries no mutation authority: decisions, constraints,
 * path, health, confidence, failure domain, security posture and recovery
 * state are projected from an already-produced canonical DecisionRecord.
 */
const isRecord = (value) => typeof value === 'object' && value !== null;
export const explainDecision = (record) => {
    const securityIncidents = record.incidents.filter((incident) => incident.classification === 'security_failure');
    const failureDomain = [
        ...new Set(record.incidents.flatMap((incident) => incident.affectedComponents)),
    ].sort();
    const plan = record.selectedPlan;
    const optimization = plan !== undefined && isRecord(plan.metadata.optimization)
        ? plan.metadata.optimization
        : undefined;
    const objectiveScore = optimization !== undefined && typeof optimization.objectiveScore === 'number'
        ? optimization.objectiveScore
        : null;
    const objectives = optimization !== undefined && isRecord(optimization.objectives)
        ? Object.freeze({ ...optimization.objectives })
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
        incidents: Object.freeze(record.incidents.map((incident) => ({
            rootCause: incident.rootCause,
            classification: incident.classification,
        }))),
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
            alternatives: Object.freeze((plan?.alternatives ?? []).map((alternative) => ({
                intent: alternative.intent,
                rejectionReasons: Object.freeze([...alternative.rejectionReasons]),
            }))),
        }),
        guards: Object.freeze({
            validationValid: record.validation?.valid ?? null,
            validationReasons: Object.freeze([...(record.validation?.reasons ?? [])]),
            safetyApplied: record.executionResult !== undefined || record.verificationResult !== undefined,
        }),
        verification: verification === undefined
            ? null
            : Object.freeze({
                status: verification.status,
                verifiedPostconditions: Object.freeze([...verification.verifiedPostconditions]),
                failedPostconditions: Object.freeze([...verification.failedPostconditions]),
            }),
    });
};
//# sourceMappingURL=explain.js.map