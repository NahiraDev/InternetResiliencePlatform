import { isCompiledIntentEffective } from './compiler.js';
import { enforceAutonomy } from './arbitration.js';
const PRIORITY = {
    low: 1,
    normal: 2,
    high: 3,
    critical: 4,
};
const AUTONOMY = {
    OBSERVE_ONLY: 0,
    ADVISORY: 1,
    SAFE_AUTOMATION: 2,
    AUTONOMOUS: 3,
    HIGH_RISK_REQUIRES_APPROVAL: 1,
};
const specificity = (intent) => Object.keys(intent.scope).filter((key) => key !== 'intentId').length;
const compare = (a, b) => PRIORITY[b.priority] - PRIORITY[a.priority] ||
    b.confidence - a.confidence ||
    AUTONOMY[b.autonomy ?? 'ADVISORY'] - AUTONOMY[a.autonomy ?? 'ADVISORY'] ||
    specificity(b) - specificity(a) ||
    a.intentId.localeCompare(b.intentId);
const overlappingScope = (a, b) => {
    const aEntries = Object.entries(a.scope).filter(([key]) => key !== 'intentId');
    const bScope = new Map(Object.entries(b.scope));
    return aEntries.some(([key, value]) => bScope.get(key) === value);
};
const modeAllowsMutation = (mode) => mode === 'live';
/**
 * Governance-specific intent selection.
 *
 * Distinct from `arbitrateIntents` in ./arbitration.js, which orders intents and
 * reports conflicts for the canonical runtime cycle. This helper applies the
 * governance admission ordering (priority, confidence, autonomy, specificity)
 * and drops overlapping losers. The two were previously both exported as
 * `arbitrateIntents`, which created an ambiguous duplicate contract.
 */
export const selectGovernedIntents = (intents) => {
    const candidates = [...intents].sort(compare);
    if (!candidates.length)
        return { candidates: [], rejectedIntents: [] };
    const selectedIntent = candidates[0];
    if (!selectedIntent)
        return { candidates: [], rejectedIntents: [] };
    const rejectedIntents = candidates
        .slice(1)
        .filter((intent) => overlappingScope(selectedIntent, intent));
    return { selectedIntent, candidates, rejectedIntents };
};
export const resolveIntentGovernance = (intents, context) => {
    const effectiveIntents = intents.filter((intent) => isCompiledIntentEffective(intent));
    const staleIntents = intents.filter((intent) => !isCompiledIntentEffective(intent));
    const arbitration = selectGovernedIntents(effectiveIntents);
    if (!arbitration.selectedIntent) {
        if (staleIntents.length) {
            return {
                admission: 'DENY',
                candidates: [],
                rejectedIntents: staleIntents,
                reasons: ['all supplied compiled intents are outside their effective lifecycle window'],
                mutationAllowed: false,
                maxRisk: 0,
            };
        }
        return {
            admission: 'ALLOW',
            candidates: [],
            rejectedIntents: [],
            reasons: ['no compiled intent supplied; preserve existing runtime behavior'],
            mutationAllowed: true,
            maxRisk: 1,
        };
    }
    const selected = arbitration.selectedIntent;
    const reasons = [];
    const trusted = context.securityContext.trusted && context.capabilitySnapshot.trusted;
    if (context.policySnapshot.policy.failClosed && !trusted)
        reasons.push('intent governance requires trusted security and capability context');
    let admission = 'ALLOW';
    let mutationAllowed = modeAllowsMutation(context.mode);
    let maxRisk = 0.75;
    if (selected.autonomy === 'OBSERVE_ONLY') {
        admission = 'PLAN_ONLY';
        mutationAllowed = false;
        maxRisk = 0;
        reasons.push('intent autonomy is observe-only');
    }
    else if (selected.autonomy === 'ADVISORY' ||
        selected.autonomy === 'HIGH_RISK_REQUIRES_APPROVAL') {
        admission = 'REQUIRE_APPROVAL';
        mutationAllowed = false;
        maxRisk = selected.autonomy === 'HIGH_RISK_REQUIRES_APPROVAL' ? 0 : 0.25;
        reasons.push(`intent autonomy requires approval: ${selected.autonomy}`);
    }
    else if (selected.autonomy === 'SAFE_AUTOMATION') {
        maxRisk = 0.5;
        if (selected.confidence < context.policySnapshot.policy.confidenceThreshold) {
            admission = 'REQUIRE_APPROVAL';
            mutationAllowed = false;
            reasons.push('intent confidence is below policy threshold');
        }
    }
    if (!trusted && selected.autonomy !== 'OBSERVE_ONLY') {
        admission = 'DENY';
        mutationAllowed = false;
        reasons.push('untrusted execution context');
    }
    if (!modeAllowsMutation(context.mode)) {
        mutationAllowed = false;
        if (admission === 'ALLOW')
            admission = 'PLAN_ONLY';
        reasons.push(`runtime mode ${context.mode} does not permit live mutation`);
    }
    // Apply the mutation-specific gate only after broader admission allows
    // mutation. PLAN_ONLY / REQUIRE_APPROVAL / DENY are intentional outcomes and
    // must not be overwritten by a lower-level check.
    if (admission === 'ALLOW' && mutationAllowed) {
        try {
            enforceAutonomy(selected, 'safe_mutate');
        }
        catch (error) {
            mutationAllowed = false;
            admission = 'DENY';
            reasons.push(error instanceof Error ? error.message : 'autonomy violation');
        }
    }
    if (arbitration.rejectedIntents.length)
        reasons.push(`arbitrated ${arbitration.rejectedIntents.length} lower-priority overlapping intent(s)`);
    if (staleIntents.length)
        reasons.push(`rejected ${staleIntents.length} intent(s) outside their effective lifecycle window`);
    return Object.freeze({
        admission,
        selectedIntent: selected,
        candidates: arbitration.candidates,
        rejectedIntents: [...arbitration.rejectedIntents, ...staleIntents],
        reasons,
        mutationAllowed,
        maxRisk,
    });
};
//# sourceMappingURL=governance.js.map