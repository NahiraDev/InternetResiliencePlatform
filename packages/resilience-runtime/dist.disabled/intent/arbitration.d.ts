/**
 * Multi-intent arbitration + policy conflict resolution for issue #274 (Section C).
 * Single source of truth for intent arbitration and policy conflict resolution.
 * No new authority — pure functions consumed by the canonical runtime.
 */
import type { PolicySnapshot, CompiledIntent, IntentConflict } from '../domain/types.js';
export type { IntentConflict };
export interface PolicyConflict {
    readonly policyA: PolicySnapshot;
    readonly policyB: PolicySnapshot;
    readonly reason: string;
    readonly resolution: 'union' | 'intersection' | 'hierarchical';
}
/**
 * Arbitrates between multiple compiled intents.
 * Returns the ordered list of intents that may proceed, plus any conflicts.
 */
export declare const arbitrateIntents: (intents: readonly CompiledIntent[], now?: Date) => {
    readonly ordered: readonly CompiledIntent[];
    readonly conflicts: readonly IntentConflict[];
};
/**
 * Policy-conflict resolution now lives in {@link PolicyRegistry}. Snapshot-level
 * callers should use `RuntimePolicyArbitrator.resolvePolicyConflicts`, which
 * delegates to that canonical implementation.
 */
/**
 * Enforces intent autonomy at the mutation boundary.
 * Throws if the action class exceeds the intent's autonomy level.
 */
export declare const enforceAutonomy: (intent: CompiledIntent, actionClass: "read" | "advise" | "safe_mutate" | "autonomous" | "high_risk") => void;
/**
 * Maps action intents to autonomy action classes for enforcement.
 */
export declare const ACTION_CLASS: Readonly<Record<string, 'read' | 'advise' | 'safe_mutate' | 'autonomous' | 'high_risk'>>;
/**
 * Canonical intent store interface — for durable persistence of intents.
 * Implementations provide the actual storage (DB, etcd, etc.).
 */
export interface IntentStore {
    readonly get: (id: string) => Promise<CompiledIntent | undefined>;
    readonly getActive: (at?: Date) => Promise<readonly CompiledIntent[]>;
    readonly put: (intent: CompiledIntent) => Promise<void>;
    readonly delete: (id: string) => Promise<void>;
    /**
     * Durable arbitration-conflict journal. Optional so read-only stores stay
     * valid; the canonical arbitrator calls it when present, so conflicts are
     * persisted wherever the runtime persists intents.
     */
    readonly recordConflicts?: (conflicts: readonly IntentConflict[]) => Promise<void>;
}
/**
 * In-memory intent store for testing and simulation.
 */
export declare class InMemoryIntentStore implements IntentStore {
    private readonly store;
    private readonly conflicts;
    get(id: string): Promise<CompiledIntent | undefined>;
    getActive(at?: Date): Promise<readonly CompiledIntent[]>;
    put(intent: CompiledIntent): Promise<void>;
    delete(id: string): Promise<void>;
    recordConflicts(conflicts: readonly IntentConflict[]): Promise<void>;
    listConflicts(): Promise<readonly IntentConflict[]>;
}
//# sourceMappingURL=arbitration.d.ts.map