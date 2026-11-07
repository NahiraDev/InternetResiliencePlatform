import { isIntentEffective } from '@irp/core';
const OBJECTIVES = [
    'reachability',
    'latency',
    'jitter',
    'packetLoss',
    'throughput',
    'reliability',
    'privacy',
    'trust',
    'cost',
    'diversity',
];
const clamp = (value) => Math.max(0, Math.min(1, value));
const normalizedRecord = (input) => Object.freeze(Object.fromEntries(Object.entries(input ?? {})
    .map(([key, value]) => [key.trim(), value])
    .filter(([key]) => key.length > 0)));
const defaultsFor = (outcome) => {
    const text = outcome.toLowerCase();
    const result = {
        reachability: 0.3,
        latency: 0.1,
        jitter: 0.05,
        packetLoss: 0.05,
        throughput: 0.1,
        reliability: 0.2,
        privacy: 0.05,
        trust: 0.05,
        cost: 0.05,
        diversity: 0.05,
    };
    if (/low latency|latency|responsive|ssh/.test(text))
        result.latency = (result.latency ?? 0) + 0.2;
    if (/video|conference|jitter|real.?time/.test(text)) {
        result.jitter = (result.jitter ?? 0) + 0.2;
        result.packetLoss = (result.packetLoss ?? 0) + 0.15;
    }
    if (/download|throughput|bandwidth/.test(text))
        result.throughput = (result.throughput ?? 0) + 0.25;
    if (/private|privacy|sensitive|trusted/.test(text)) {
        result.privacy = (result.privacy ?? 0) + 0.2;
        result.trust = (result.trust ?? 0) + 0.2;
    }
    if (/diverse|independent|restricted|reach/.test(text)) {
        result.reachability = (result.reachability ?? 0) + 0.15;
        result.diversity = (result.diversity ?? 0) + 0.15;
    }
    const total = Object.values(result).reduce((sum, value) => sum + value, 0);
    return Object.fromEntries(OBJECTIVES.map((objective) => [objective, clamp((result[objective] ?? 0) / total)]));
};
/**
 * Converts a declarative, active NetworkIntent into bounded runtime inputs.
 * This function only compiles evidence/constraints; it cannot authorize or
 * execute a network mutation.
 */
export const compileNetworkIntent = (intent, at = new Date()) => {
    if (!isIntentEffective(intent, at))
        throw new Error(`Network intent ${intent.id} is not active in the requested time window`);
    const constraints = normalizedRecord(intent.spec.constraints);
    const explicitObjectives = intent.spec.objectives;
    return Object.freeze({
        intentId: intent.id,
        version: intent.version,
        priority: intent.priority,
        desiredOutcome: intent.spec.outcome.trim(),
        target: normalizedRecord(intent.spec.target),
        constraints,
        objectives: Object.freeze(explicitObjectives
            ? Object.freeze(Object.fromEntries(Object.entries(explicitObjectives).map(([k, v]) => [
                k,
                Math.max(0, Math.min(1, v)),
            ])))
            : defaultsFor(intent.spec.outcome)),
        confidence: intent.confidence ?? 1,
        provenance: intent.provenance ?? 'network-intent',
        autonomy: intent.autonomy ?? 'ADVISORY',
        scope: Object.freeze({
            ...intent.spec.target,
            intentId: intent.id,
        }),
        ...(intent.effectiveFrom ? { effectiveFrom: intent.effectiveFrom } : {}),
        ...(intent.expiresAt ? { expiresAt: intent.expiresAt } : {}),
        compiledAt: at.toISOString(),
    });
};
/**
 * Revalidates a compiled intent at the point it is consumed. Compilation and
 * execution may be separated by a scheduler/queue, so checking only the
 * source NetworkIntent at compilation time would allow an expired intent to
 * remain executable.
 */
export const isCompiledIntentEffective = (intent, at = new Date()) => {
    const timestamp = at.getTime();
    const from = intent.effectiveFrom ? Date.parse(intent.effectiveFrom) : Number.NEGATIVE_INFINITY;
    const expires = intent.expiresAt ? Date.parse(intent.expiresAt) : Number.POSITIVE_INFINITY;
    return Number.isFinite(timestamp) && timestamp >= from && timestamp < expires;
};
//# sourceMappingURL=compiler.js.map