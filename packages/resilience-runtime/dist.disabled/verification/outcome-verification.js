/**
 * Scoped health and outcome verification for issue #279 (issue #272 Section H,
 * tasks 1 and 2).
 *
 * Task 1: verify destination/service/application outcomes, not only the action
 * return code. A mutation that returns `success` can still leave the
 * destination unreachable, so verification must probe the actual outcome.
 *
 * Task 2: health is scoped across nine dimensions rather than one global
 * verdict, because a resource can be healthy while its destination is not.
 */
import { deepFreeze, nextId } from '../domain/ids.js';
/**
 * Named `ScopedHealth*` rather than `HealthSignal`/`HealthStatus`: `@irp/failover`
 * and `@irp/telemetry` already export types with those names and different
 * shapes. Three different `HealthStatus` meanings in one runtime is the exact
 * ambiguity the archaeology drift register exists to prevent.
 */
export const HEALTH_SCOPES = [
    'resource',
    'path',
    'destination',
    'service',
    'application',
    'workload',
    'transport',
    'region',
    'provider',
];
const SEVERITY_ORDER = Object.freeze({
    healthy: 0,
    stale: 1,
    unknown: 2,
    degraded: 3,
    failed: 4,
});
/**
 * Rolls per-scope signals into a report. A scope with no signal is `unknown`,
 * never silently `healthy` — missing evidence is not good news.
 */
export const buildHealthReport = (signals) => {
    const byScope = {};
    for (const scope of HEALTH_SCOPES) {
        const scoped = signals.filter((signal) => signal.scope === scope);
        if (scoped.length === 0) {
            byScope[scope] = 'unknown';
            continue;
        }
        // Worst observed status wins: one failed destination must not be averaged
        // away by healthy signals elsewhere.
        byScope[scope] = scoped.reduce((worst, signal) => SEVERITY_ORDER[signal.status] > SEVERITY_ORDER[worst] ? signal.status : worst, 'healthy');
    }
    const overall = HEALTH_SCOPES.reduce((worst, scope) => (SEVERITY_ORDER[byScope[scope]] > SEVERITY_ORDER[worst] ? byScope[scope] : worst), 'healthy');
    return deepFreeze({
        byScope: Object.freeze(byScope),
        overall,
        signals: Object.freeze([...signals].sort((a, b) => a.scope.localeCompare(b.scope))),
        degradedScopes: Object.freeze(signals
            .filter((signal) => signal.status === 'degraded' || signal.status === 'failed')
            .map((signal) => ({ scope: signal.scope, subjectId: signal.subjectId }))
            .sort((a, b) => a.scope.localeCompare(b.scope) || a.subjectId.localeCompare(b.subjectId))),
    });
};
const probeSignalStatus = (reachable) => (reachable ? 'healthy' : 'failed');
/**
 * Verifies the real outcome of a mutation.
 *
 * An action reporting `success` is **not** treated as proof. Every supplied
 * probe must succeed. When no probes are supplied the result is explicitly
 * `unverified` rather than `verified`, so an unverified mutation cannot be
 * recorded as an outcome that supports learning.
 */
export const verifyOutcome = async (input, nowMs = Date.now()) => {
    const observedAt = new Date(nowMs).toISOString();
    const probeResults = [];
    for (const probe of [...input.probes].sort((a, b) => a.scope.localeCompare(b.scope) || a.subjectId.localeCompare(b.subjectId))) {
        try {
            const result = await probe.probe();
            probeResults.push({
                scope: probe.scope,
                subjectId: probe.subjectId,
                reachable: result.reachable,
                ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
            });
        }
        catch (error) {
            probeResults.push({
                scope: probe.scope,
                subjectId: probe.subjectId,
                reachable: false,
                error: error instanceof Error ? error.message : 'probe-threw',
            });
        }
    }
    const probesPassed = input.probes.length > 0 && probeResults.every((result) => result.reachable);
    const actionSucceeded = input.actionStatus === 'success' || input.actionStatus === 'skipped';
    const signals = probeResults.map((result) => ({
        scope: result.scope,
        subjectId: result.subjectId,
        status: probeSignalStatus(result.reachable),
        confidence: 1,
        observedAt,
        detail: { latencyMs: result.latencyMs ?? -1, error: result.error ?? '' },
    }));
    // No probes means no outcome evidence. Recording `unknown` rather than
    // `healthy` keeps an unverified mutation from reinforcing a strategy.
    if (input.probes.length === 0) {
        signals.push({
            scope: 'destination',
            subjectId: 'unprobed',
            status: 'unknown',
            confidence: 0,
            observedAt,
        });
    }
    const failedProbes = probeResults.filter((result) => !result.reachable);
    const verifiedPostconditions = failedProbes.length === 0 && actionSucceeded
        ? [...input.expectedPostconditions]
        : [];
    const failedPostconditions = failedProbes.length === 0 && actionSucceeded
        ? []
        : input.expectedPostconditions.length > 0
            ? [...input.expectedPostconditions]
            : [`probe-failed:${failedProbes.map((p) => `${p.scope}/${p.subjectId}`).join(',')}`];
    const outcomeVerified = probesPassed && actionSucceeded && failedPostconditions.length === 0;
    // Rollback verification is judged the same way: by re-probing, never by
    // trusting the rollback call's return code.
    const terminal = outcomeVerified || failedProbes.length > 0;
    return deepFreeze({
        id: nextId('outcome'),
        schemaVersion: 1,
        createdAt: observedAt,
        correlationId: input.correlationId,
        source: 'resilience-runtime',
        metadata: Object.freeze({
            ...(input.planId !== undefined ? { planId: input.planId } : {}),
            ...(input.transactionId !== undefined ? { transactionId: input.transactionId } : {}),
            ...(input.mutationId !== undefined ? { mutationId: input.mutationId } : {}),
            rollbackVerification: input.rollbackVerification ?? false,
            actionStatus: input.actionStatus,
        }),
        outcomeVerified,
        actionSucceededButOutcomeFailed: actionSucceeded && !outcomeVerified,
        health: buildHealthReport(signals),
        probeResults: Object.freeze(probeResults),
        verifiedPostconditions: Object.freeze(verifiedPostconditions),
        failedPostconditions: Object.freeze(failedPostconditions),
        terminal,
    });
};
//# sourceMappingURL=outcome-verification.js.map