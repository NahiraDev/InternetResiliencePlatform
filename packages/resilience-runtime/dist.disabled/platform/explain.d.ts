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
    readonly path: {
        readonly from: string;
        readonly to: string;
    };
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
export declare const explainDecision: (record: DecisionRecord) => DecisionExplanation;
//# sourceMappingURL=explain.d.ts.map