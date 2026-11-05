/**
 * Operator-facing interpretation of what the daemon reports.
 *
 * These are pure functions of the daemon's own responses. They add no claims of their own: every
 * finding names the field it came from, and "healthy" requires positive evidence, never just the
 * absence of errors.
 */
export const EXIT = { ok: 0, error: 1, degraded: 2, unreachable: 3, blocked: 4 };
const obj = (value) => (typeof value === 'object' && value !== null ? value : {});
const arr = (value) => (Array.isArray(value) ? value : []);
const str = (value) => (typeof value === 'string' ? value : undefined);
export const summarizeDecision = (record) => {
    const r = obj(record);
    const policy = obj(r.policyEvaluation);
    const plan = obj(r.selectedPlan);
    const exec = obj(r.executionResult);
    const verify = obj(r.verificationResult);
    const hasExec = Object.keys(exec).length > 0;
    const hasVerify = Object.keys(verify).length > 0;
    let execution = 'none';
    if (hasExec) {
        if (exec.status === 'failed')
            execution = 'failed';
        else if (exec.status === 'skipped')
            execution = 'skipped';
        else
            execution = exec.simulated === true ? 'simulated' : 'executed';
    }
    const verification = hasVerify
        ? verify.status === 'success'
            ? 'verified'
            : String(verify.status ?? 'none')
        : 'none';
    return {
        decisionId: str(r.decisionId) ?? null,
        at: str(r.createdAt) ?? null,
        mode: str(obj(r.runtimeContext).mode) ?? null,
        outcome: str(r.outcome) ?? null,
        action: str(obj(plan.selectedAction).intent) ?? null,
        blockedBecause: policy.allowed === false ? arr(policy.reasons).filter((x) => typeof x === 'string') : [],
        execution,
        verification,
        executedAndVerified: execution === 'executed' && verification === 'verified',
    };
};
export const assessDaemon = (input) => {
    const health = obj(input.health);
    const auth = obj(health.authorization);
    const storage = obj(health.storage);
    const scheduler = obj(health.scheduler);
    const runtimeHealth = obj(obj(input.snapshot).health);
    const decisions = arr(input.decisions);
    const last = decisions.length ? summarizeDecision(decisions[decisions.length - 1]) : null;
    const findings = [];
    const lifecycle = str(health.lifecycle) ?? null;
    if (lifecycle !== 'running' && lifecycle !== 'ready')
        findings.push({ level: 'error', code: 'lifecycle', message: `daemon lifecycle is ${lifecycle ?? 'unknown'}, not running` });
    const blockers = arr(auth.blockers).filter((x) => typeof x === 'string');
    for (const blocker of blockers)
        findings.push({
            level: 'warning',
            code: 'host-authorization',
            message: blocker,
            ...(auth.requestedMode === 'live'
                ? { hint: 'live mutation was requested but is not active; the daemon is running observe-only' }
                : {}),
        });
    const persistent = storage.persistent === true;
    const storageKind = storage.persistent === undefined ? 'unknown' : persistent ? 'persistent' : 'in-memory';
    if (storage.persistent === false)
        findings.push({
            level: 'warning',
            code: 'volatile-state',
            message: 'decisions and incidents are kept in memory and will be lost on restart',
            hint: 'set IRP_STATE_DIR (the systemd unit does) so history and crash recovery survive restarts',
        });
    if (scheduler.enabled === false)
        findings.push({
            level: 'info',
            code: 'scheduler-off',
            message: 'periodic cycles are disabled; the daemon only decides when asked',
            hint: 'set IRP_RUNTIME_ENABLED=1 to run cycles automatically',
        });
    const rh = str(runtimeHealth.status) ?? null;
    if (rh === 'failed')
        findings.push({ level: 'error', code: 'runtime-failed', message: `runtime health is failed: ${str(runtimeHealth.reason) ?? 'no reason reported'}` });
    else if (rh !== 'healthy')
        findings.push({ level: 'warning', code: 'no-health-evidence', message: `runtime health is ${rh ?? 'unreported'}: ${str(runtimeHealth.reason) ?? 'no verified healthy evidence'}` });
    const dnsPending = obj(health.recovery).dnsRestorePending === true;
    if (dnsPending)
        findings.push({ level: 'warning', code: 'dns-restore-pending', message: 'original DNS resolvers have not been restored yet' });
    if (last?.outcome === 'blocked')
        findings.push({
            level: 'error',
            code: 'decision-blocked',
            message: `the latest decision was blocked: ${last.blockedBecause.join('; ') || 'no reason recorded'}`,
        });
    let state;
    let exitCode;
    if (last?.outcome === 'blocked')
        ({ state, exitCode } = { state: 'blocked', exitCode: EXIT.blocked });
    else if (findings.some((f) => f.level === 'error') || rh === 'failed')
        ({ state, exitCode } = { state: 'degraded', exitCode: EXIT.degraded });
    else if (findings.some((f) => f.level === 'warning'))
        ({ state, exitCode } = { state: rh === 'healthy' ? 'degraded' : 'unknown', exitCode: EXIT.degraded });
    else
        ({ state, exitCode } = { state: 'healthy', exitCode: EXIT.ok });
    // Positive evidence is mandatory for "healthy".
    if (state === 'healthy' && rh !== 'healthy')
        ({ state, exitCode } = { state: 'unknown', exitCode: EXIT.degraded });
    return {
        state,
        exitCode,
        findings,
        summary: {
            lifecycle,
            requestedMode: str(auth.requestedMode) ?? null,
            effectiveMode: str(auth.effectiveMode) ?? null,
            liveActive: typeof auth.liveActive === 'boolean' ? auth.liveActive : null,
            periodicCycles: typeof scheduler.enabled === 'boolean' ? scheduler.enabled : null,
            storage: storageKind,
            runtimeHealth: rh,
            lastDecision: last,
        },
    };
};
//# sourceMappingURL=diagnostics.js.map