/**
 * Multi-intent arbitration + policy conflict resolution for issue #274 (Section C).
 * Single source of truth for intent arbitration and policy conflict resolution.
 * No new authority — pure functions consumed by the canonical runtime.
 */
import { isAutonomyPermitted } from '@irp/core';
/**
 * Arbitrates between multiple compiled intents.
 * Returns the ordered list of intents that may proceed, plus any conflicts.
 */
export const arbitrateIntents = (intents, now = new Date()) => {
    // Filter to only effective intents
    const effective = intents.filter((intent) => {
        const from = intent.effectiveFrom ? Date.parse(intent.effectiveFrom) : Number.NEGATIVE_INFINITY;
        const expires = intent.expiresAt ? Date.parse(intent.expiresAt) : Number.POSITIVE_INFINITY;
        const timestamp = now.getTime();
        return timestamp >= from && timestamp < expires;
    });
    // Sort by priority (critical > high > normal > low), then by version (newer wins), then by created time
    const priorityOrder = {
        critical: 4,
        high: 3,
        normal: 2,
        low: 1,
    };
    const ordered = effective.slice().sort((a, b) => {
        const pa = priorityOrder[a.priority] ?? 0;
        const pb = priorityOrder[b.priority] ?? 0;
        if (pa !== pb)
            return pb - pa;
        if (a.version !== b.version)
            return b.version - a.version;
        return new Date(b.compiledAt).getTime() - new Date(a.compiledAt).getTime();
    });
    // Detect conflicts: overlapping scopes with different desired outcomes
    const conflicts = [];
    for (let i = 0; i < ordered.length; i++) {
        for (let j = i + 1; j < ordered.length; j++) {
            const a = ordered[i];
            const b = ordered[j];
            if (scopesOverlap(a, b) && a.desiredOutcome !== b.desiredOutcome) {
                // A is always the preferred intent (higher priority / version / recency).
                // 'supersede-b' means the lower-ranked B is superseded by A.
                const resolution = 'supersede-b';
                conflicts.push({
                    intentA: a,
                    intentB: b,
                    reason: `Overlapping scope with different outcomes: ${a.desiredOutcome} vs ${b.desiredOutcome}`,
                    resolution,
                });
            }
        }
    }
    return { ordered: Object.freeze(ordered), conflicts: Object.freeze(conflicts) };
};
const scopesOverlap = (a, b) => {
    const aEntries = Object.entries(a.scope).filter(([key]) => key !== 'intentId');
    const bScope = new Map(Object.entries(b.scope));
    return aEntries.some(([key, value]) => bScope.get(key) === value);
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
export const enforceAutonomy = (intent, actionClass) => {
    if (!isAutonomyPermitted(intent, actionClass)) {
        throw new Error(`Autonomy violation: intent ${intent.intentId} (autonomy=${intent.autonomy}) ` +
            `does not permit action class ${actionClass}`);
    }
};
/**
 * Maps action intents to autonomy action classes for enforcement.
 */
export const ACTION_CLASS = Object.freeze({
    noop: 'read',
    health_reprobe: 'advise',
    dns_switch: 'safe_mutate',
    provider_switch: 'safe_mutate',
    route_change: 'autonomous',
    tunnel_switch: 'autonomous',
    connectivity_failover: 'autonomous',
    recovery: 'high_risk',
    rollback: 'high_risk',
    degraded_mode: 'autonomous',
});
/**
 * In-memory intent store for testing and simulation.
 */
export class InMemoryIntentStore {
    store = new Map();
    conflicts = [];
    async get(id) {
        return this.store.get(id);
    }
    async getActive(at = new Date()) {
        const all = Array.from(this.store.values());
        return all.filter((intent) => {
            const from = intent.effectiveFrom
                ? Date.parse(intent.effectiveFrom)
                : Number.NEGATIVE_INFINITY;
            const expires = intent.expiresAt ? Date.parse(intent.expiresAt) : Number.POSITIVE_INFINITY;
            const timestamp = at.getTime();
            return timestamp >= from && timestamp < expires;
        });
    }
    async put(intent) {
        this.store.set(intent.intentId, intent);
    }
    async delete(id) {
        this.store.delete(id);
    }
    async recordConflicts(conflicts) {
        for (const conflict of conflicts) {
            this.conflicts.push(conflict);
        }
    }
    async listConflicts() {
        return Object.freeze([...this.conflicts]);
    }
}
//# sourceMappingURL=arbitration.js.map