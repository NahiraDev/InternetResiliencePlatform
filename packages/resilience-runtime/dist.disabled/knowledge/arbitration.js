/**
 * Deterministic evidence/confidence arbitration for issue #276 (task 4).
 *
 * Several records may assert the same objective. Arbitration must be
 * deterministic (same inputs always yield the same result), explainable (every
 * contribution is retained) and fail-safe (expired, untrusted or unscoped
 * evidence is discarded rather than trusted).
 *
 * Arbitration only produces objective evidence. It cannot allow a candidate,
 * grant a capability or bypass policy.
 */
import { SOURCE_TRUST_ORDER, decayedConfidence, isAdvisoryOnly, isExpired, scopeMatches, } from './knowledge-record.js';
const MAX_WEIGHT = 1;
const emptyResult = () => Object.freeze({
    evidence: Object.freeze({}),
    weights: Object.freeze({}),
    contributions: Object.freeze([]),
    rejected: Object.freeze([]),
    advisoryShare: 0,
});
/**
 * Aggregates objective evidence from knowledge records.
 *
 * Weighting per record is `decayedConfidence x sourceTrust x corroborationFactor`.
 * Values are combined as a weighted mean, so a single very confident record can
 * move the result but cannot dominate without corroboration.
 */
export const arbitrateKnowledge = (records, options = {}) => {
    if (records.length === 0)
        return emptyResult();
    const nowMs = options.nowMs ?? Date.now();
    const activeScope = options.scope ?? {};
    const requireSignature = options.requireFederationSignature ?? true;
    const corroborationBonus = options.corroborationBonus ?? 0.15;
    const contributions = [];
    const rejected = [];
    const sums = {};
    const weights = {};
    let advisoryWeight = 0;
    let totalWeight = 0;
    // Deterministic order: freshest first, then id, so ties never depend on
    // input ordering.
    const ordered = [...records].sort((a, b) => {
        const at = Date.parse(b.observedAt);
        const bt = Date.parse(a.observedAt);
        if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt)
            return at - bt;
        return a.id.localeCompare(b.id);
    });
    for (const record of ordered) {
        if (isExpired(record, nowMs)) {
            rejected.push({ knowledgeId: record.id, reason: 'expired' });
            continue;
        }
        if (!scopeMatches(record.scope, activeScope)) {
            rejected.push({ knowledgeId: record.id, reason: 'scope-mismatch' });
            continue;
        }
        if (record.source === 'federated') {
            if (record.provenance.signature === undefined) {
                rejected.push({ knowledgeId: record.id, reason: 'unsigned-federation' });
                continue;
            }
            if (requireSignature && record.provenance.trustLevel === 'untrusted') {
                rejected.push({ knowledgeId: record.id, reason: 'untrusted-federation' });
                continue;
            }
        }
        const entries = Object.entries(record.objectiveEvidence ?? {});
        if (entries.length === 0) {
            rejected.push({ knowledgeId: record.id, reason: 'no-evidence' });
            continue;
        }
        const hasNonFinite = entries.some(([, value]) => !Number.isFinite(value));
        if (hasNonFinite) {
            rejected.push({ knowledgeId: record.id, reason: 'non-finite-evidence' });
            continue;
        }
        const decayed = decayedConfidence(record, nowMs);
        if (decayed <= 0) {
            rejected.push({ knowledgeId: record.id, reason: 'expired' });
            continue;
        }
        const trust = SOURCE_TRUST_ORDER[record.source] ?? 0.5;
        // Corroboration strengthens weight only. Values are never inflated.
        const corroborationFactor = 1 + Math.min(2, record.corroborations.length) * corroborationBonus;
        const weight = Math.min(MAX_WEIGHT, decayed * trust * corroborationFactor);
        const advisory = isAdvisoryOnly(record.source);
        for (const [objective, value] of entries) {
            const clamped = Math.max(0, Math.min(1, value));
            sums[objective] = (sums[objective] ?? 0) + clamped * weight;
            weights[objective] = (weights[objective] ?? 0) + weight;
            contributions.push(Object.freeze({
                knowledgeId: record.id,
                objective,
                value: clamped,
                weight,
                source: record.source,
                kind: record.kind,
                advisoryOnly: advisory,
            }));
        }
        advisoryWeight += advisory ? weight : 0;
        totalWeight += weight;
    }
    const evidence = {};
    for (const [objective, sum] of Object.entries(sums)) {
        const weight = weights[objective] ?? 0;
        if (weight > 0)
            evidence[objective] = sum / weight;
    }
    if (Object.keys(evidence).length === 0) {
        return Object.freeze({
            ...emptyResult(),
            rejected: Object.freeze(rejected),
            contributions: Object.freeze(contributions),
        });
    }
    return Object.freeze({
        evidence: Object.freeze(evidence),
        weights: Object.freeze(weights),
        contributions: Object.freeze(contributions),
        rejected: Object.freeze(rejected),
        advisoryShare: totalWeight > 0 ? advisoryWeight / totalWeight : 0,
    });
};
/**
 * Human-readable explanation of an arbitration result, retained in decision
 * records so a ranking decision can always be traced back to its evidence.
 */
export const explainArbitration = (result) => result.contributions
    .map((c) => `${c.objective}=${c.value.toFixed(3)} (w=${c.weight.toFixed(3)}, ${c.source}/${c.kind}${c.advisoryOnly ? ', advisory' : ''})`)
    .join('; ');
//# sourceMappingURL=arbitration.js.map