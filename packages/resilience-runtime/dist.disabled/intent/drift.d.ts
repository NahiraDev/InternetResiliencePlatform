import type { CompiledIntent } from '../domain/types.js';
export type DriftSeverity = 'none' | 'low' | 'medium' | 'high';
export interface IntentDriftResult {
    readonly intentId: string;
    readonly effective: boolean;
    readonly observedDelta: Record<string, unknown>;
    readonly severity: DriftSeverity;
    readonly recommendedAdmission: 'ALLOW' | 'PLAN_ONLY' | 'REQUIRE_APPROVAL' | 'DENY' | 'OBSERVE_ONLY';
    readonly reasons: readonly string[];
}
/**
 * Observe-only drift detector. Never mutates state or applies changes.
 * Compares observed numeric metrics against the intent's objectives map,
 * respecting whether higher or lower values are better for each objective.
 * Any detected drift is returned as OBSERVE_ONLY so that callers must still
 * route through intent governance and the safety kernel before any action.
 */
export declare const detectIntentDrift: (intent: CompiledIntent, observed: Readonly<Record<string, unknown>>, at?: Date) => IntentDriftResult;
//# sourceMappingURL=drift.d.ts.map