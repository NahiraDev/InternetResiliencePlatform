const severity = {
    healthy: 0,
    degraded: 1,
    unknown: 2,
    unhealthy: 3,
};
export const classifyDiagnosticFailure = (status, error) => {
    if (status === undefined)
        return error ? 'unhealthy' : 'unknown';
    if (status >= 200 && status < 300)
        return 'healthy';
    if (status === 429 || (status >= 500 && status < 600))
        return 'unhealthy';
    if (status >= 400)
        return 'degraded';
    return 'unknown';
};
const recommendationFor = (check) => {
    if (check.state === 'healthy')
        return undefined;
    if (check.name === 'readiness')
        return 'Inspect dependency readiness and startup/runtime logs before changing network policy.';
    if (check.name === 'network')
        return 'Inspect DNS, transport, route/provider health and application-level reachability before switching paths.';
    if (check.name === 'platform')
        return 'Inspect the current route decision, recovery issues and dependency state; do not blindly retry or flap routes.';
    if (check.name === 'metrics')
        return 'Restore the local metrics exposition path; diagnostics remain usable without external telemetry collectors.';
    return `Investigate the ${check.name} diagnostic check and its structured details.`;
};
const cloneCheck = (check) => ({
    name: check.name,
    state: check.state,
    ...(check.latencyMs !== undefined ? { latencyMs: check.latencyMs } : {}),
    ...(check.httpStatus !== undefined ? { httpStatus: check.httpStatus } : {}),
    ...(check.details !== undefined ? { details: { ...check.details } } : {}),
});
export const buildOperationalDiagnosticReport = (input, generatedAt = new Date().toISOString()) => {
    const checks = input.checks.map(cloneCheck);
    const worst = checks.reduce((current, check) => (severity[check.state] > severity[current] ? check.state : current), 'healthy');
    const platform = input.platformStatus ?? {};
    const dependencies = platform.dependencies ?? {};
    const decision = platform.decision ?? {};
    const observability = platform.observability ?? {};
    const recommendations = checks
        .map(recommendationFor)
        .filter((value) => Boolean(value));
    return {
        schemaVersion: 1,
        generatedAt,
        target: input.target,
        overall: worst,
        checks,
        dependencies,
        decision,
        observability: {
            metrics: input.metricsAvailable === true
                ? 'available'
                : input.metricsAvailable === false
                    ? 'unavailable'
                    : 'unknown',
            ...(observability.telemetry !== undefined ? { telemetry: observability.telemetry } : {}),
        },
        recommendations: [...new Set(recommendations)],
    };
};
//# sourceMappingURL=diagnostics.js.map