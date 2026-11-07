/**
 * Failure classification and adaptive control intensity for issue #279
 * (issue #272 Section H, tasks 3 and 4).
 *
 * Task 4: classify a failure by the layer that actually failed and by failure
 * domain, so the runtime can distinguish "this path broke" from "this whole
 * provider is down". Retrying blindly wastes mutation budget and can deepen the
 * incident.
 *
 * Task 3: control intensity adapts to observed outcomes. After repeated
 * failures the runtime must reduce how aggressively it acts, and it must relax
 * again only with evidence.
 */
import { deepFreeze } from '../domain/ids.js';
export const FAILURE_LAYERS = [
    'application',
    'service',
    'destination',
    'transport',
    'path',
    'resource',
    'provider',
    'region',
    'unknown',
];
const LAYER_FOR_SCOPE = Object.freeze({
    application: 'application',
    service: 'service',
    destination: 'destination',
    transport: 'transport',
    path: 'path',
    resource: 'resource',
    region: 'region',
    provider: 'provider',
    workload: 'application',
});
/** Widest-to-narrowest, used to report the outermost layer that is broken. */
const SCOPE_BREADTH = [
    'provider',
    'region',
    'resource',
    'transport',
    'path',
    'destination',
    'service',
    'workload',
    'application',
];
/**
 * Classifies a failure from scoped health. The outermost failing scope bounds
 * the incident: if `transport` is failed then `destination` being failed is a
 * consequence, not an independent fault, and a strategy targeting the
 * destination alone would be a blind retry.
 */
export const classifyFailureLayer = (health, options = {}) => {
    const failing = SCOPE_BREADTH.filter((scope) => health.byScope[scope] === 'failed' || health.byScope[scope] === 'degraded');
    const healthyScopes = SCOPE_BREADTH.filter((scope) => health.byScope[scope] === 'healthy');
    if (failing.length === 0) {
        return deepFreeze({
            failedLayer: 'unknown',
            widestAffectedScope: 'none',
            healthyScopes: Object.freeze(healthyScopes),
            correlated: false,
            rationale: 'no failing scope: nothing to classify',
        });
    }
    // Outermost failing scope wins: SCOPE_BREADTH runs broadest-first, so the
    // first failing entry is the broadest true statement. A failed transport
    // bounds a failed destination as a consequence, not an independent fault.
    const widestAffectedScope = failing[0];
    const failedLayer = LAYER_FOR_SCOPE[widestAffectedScope];
    // Correlated: an outer layer and everything beneath it all failed together.
    const correlated = failing.length >= 2 && failing.some((scope) => SCOPE_BREADTH.indexOf(scope) > SCOPE_BREADTH.indexOf(widestAffectedScope));
    const domains = new Set((options.signals ?? health.signals)
        .filter((signal) => signal.failureDomain !== undefined)
        .map((signal) => signal.failureDomain));
    let alternativeHint;
    if (widestAffectedScope === 'transport')
        alternativeHint = 'path';
    else if (widestAffectedScope === 'path')
        alternativeHint = 'resource';
    else if (widestAffectedScope === 'resource')
        alternativeHint = 'provider';
    else if (widestAffectedScope === 'provider')
        alternativeHint = 'region';
    return deepFreeze({
        failedLayer,
        widestAffectedScope,
        ...(options.failureDomain !== undefined ? { failureDomain: options.failureDomain } : {}),
        healthyScopes: Object.freeze(healthyScopes),
        correlated,
        ...(alternativeHint !== undefined ? { alternativeHint } : {}),
        rationale: `outermost failing scope '${widestAffectedScope}' bounds the incident; ` +
            `${failing.length} scope(s) failing across ${domains.size || 1} failure domain(s)`,
    });
};
export const CONTROL_INTENSITIES = ['observe', 'probe', 'degraded', 'autonomous'];
/**
 * Adaptive control intensity.
 *
 * Demotion is faster than promotion (default 2 failures vs 3 successes) because
 * an unverified action during an incident is worse than a slow one. Promotion
 * requires verified evidence, and the ceiling means learning can never grant
 * itself the highest intensity — that requires explicit operator policy.
 */
export class AdaptiveControlIntensity {
    level;
    successes = 0;
    failures = 0;
    promotions = 0;
    promoteAfter;
    demoteAfter;
    ceiling;
    start;
    constructor(options = {}) {
        this.promoteAfter = Math.max(1, options.promoteAfter ?? 3);
        this.demoteAfter = Math.max(1, options.demoteAfter ?? 2);
        this.ceiling = options.ceiling ?? 'degraded';
        this.start = options.start ?? 'observe';
        this.level = CONTROL_INTENSITIES.indexOf(this.start);
    }
    get ceilingIndex() {
        return CONTROL_INTENSITIES.indexOf(this.ceiling);
    }
    /** Records a *verified* successful outcome. Return codes are not evidence. */
    recordSuccess() {
        this.successes += 1;
        this.failures = 0;
        if (this.successes >= this.promoteAfter && this.level < this.ceilingIndex) {
            this.level += 1;
            this.promotions += 1;
            this.successes = 0;
            return this.state(`promoted to '${CONTROL_INTENSITIES[this.level]}' after ${this.promoteAfter} verified successes`);
        }
        return this.state(`${this.successes}/${this.promoteAfter} successes toward promotion`);
    }
    /** Records a verified failure or an unverified outcome. */
    recordFailure() {
        this.failures += 1;
        this.successes = 0;
        if (this.failures >= this.demoteAfter && this.level > 0) {
            this.level -= 1;
            this.failures = 0;
            return this.state(`demoted to '${CONTROL_INTENSITIES[this.level]}' after ${this.demoteAfter} failures`);
        }
        return this.state(`${this.failures}/${this.demoteAfter} failures toward demotion`);
    }
    reset() {
        this.level = CONTROL_INTENSITIES.indexOf(this.start);
        this.successes = 0;
        this.failures = 0;
        this.promotions = 0;
        return this.state('reset to starting intensity');
    }
    state(rationale) {
        return deepFreeze({
            intensity: CONTROL_INTENSITIES[this.level],
            consecutiveSuccesses: this.successes,
            consecutiveFailures: this.failures,
            promotions: this.promotions,
            rationale,
        });
    }
    snapshot() {
        return this.state('snapshot');
    }
}
//# sourceMappingURL=adaptive-control.js.map