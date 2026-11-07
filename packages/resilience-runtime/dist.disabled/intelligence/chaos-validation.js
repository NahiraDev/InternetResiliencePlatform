/**
 * Phase 126 — Chaos, Resilience & Hardware-in-the-Loop Validation.
 *
 * Experiment definitions with a steady-state hypothesis, a bounded blast
 * radius, abort conditions and guaranteed cleanup. Faults are injected only
 * through a `FaultInjectionPort` (simulation, lab or hardware-in-the-loop
 * rig). Experiments targeting live production are refused unless explicitly
 * authorised with an approval, and the cleanup always runs.
 */
export const validateExperiment = (e) => {
    const problems = [];
    if (e.targets.length === 0)
        problems.push('no-targets');
    if (e.targets.length > e.maxTargets)
        problems.push('blast-radius-exceeded');
    if (!(e.maxTargets >= 1))
        problems.push('invalid-max-targets');
    if (!(e.durationMs > 0))
        problems.push('invalid-duration');
    if (e.steadyState.length === 0)
        problems.push('no-steady-state-hypothesis');
    if (e.environment === 'production' && !e.approvalId)
        problems.push('production-requires-approval');
    if (e.environment === 'production' && e.maxTargets > 1)
        problems.push('production-blast-radius-limited-to-one');
    return Object.freeze(problems);
};
const sleep = (ms, signal) => new Promise((resolve) => { const t = setTimeout(resolve, ms); signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true }); });
const safeCheck = async (p) => { try {
    return (await p.check()).ok;
}
catch {
    return false;
} };
export const runChaosExperiment = async (e, port, options = {}) => {
    const now = options.nowMs ?? (() => Date.now());
    const startedAtMs = now();
    const done = (status, reasons, extra = {}) => Object.freeze({ experimentId: e.id, status, reasons: Object.freeze(reasons), steadyBefore: Object.freeze([]), violations: Object.freeze([]), restored: false, startedAtMs, endedAtMs: now(), ...extra });
    const problems = validateExperiment(e);
    if (problems.length > 0)
        return done('refused', [...problems]);
    const before = [];
    for (const p of e.steadyState)
        if (!(await safeCheck(p)))
            before.push(p.name);
    if (before.length > 0)
        return done('refused', ['steady-state-not-established'], { steadyBefore: Object.freeze(before) });
    const ctl = new AbortController();
    const parent = options.signal;
    const onAbort = () => ctl.abort();
    parent?.addEventListener('abort', onAbort, { once: true });
    let restored = false;
    const violations = [];
    let aborted = parent?.aborted ?? false;
    try {
        try {
            await port.inject(e.fault, e.targets, ctl.signal);
        }
        catch (error) {
            await port.restore(e.fault, e.targets).then(() => { restored = true; }, () => undefined);
            return done('inject-failed', [error instanceof Error ? error.message : 'inject-error'], { restored });
        }
        const deadline = now() + e.durationMs;
        const poll = e.pollMs ?? Math.max(1, Math.floor(e.durationMs / 10));
        while (now() < deadline && !ctl.signal.aborted) {
            for (const p of e.abortOn ?? [])
                if (!(await safeCheck(p))) {
                    violations.push(`abort:${p.name}`);
                    aborted = true;
                }
            if (aborted)
                break;
            await sleep(Math.min(poll, Math.max(0, deadline - now())), ctl.signal);
        }
        if (parent?.aborted)
            aborted = true;
    }
    finally {
        parent?.removeEventListener('abort', onAbort);
        try {
            await port.restore(e.fault, e.targets);
            restored = true;
        }
        catch {
            restored = false;
        }
    }
    if (!restored)
        return done('aborted', ['restore-failed'], { violations: Object.freeze(violations), restored });
    if (aborted)
        return done('aborted', ['abort-condition-triggered'], { violations: Object.freeze(violations), restored });
    const after = [];
    for (const p of e.steadyState)
        if (!(await safeCheck(p)))
            after.push(p.name);
    if (after.length > 0)
        return done('failed-hypothesis', ['steady-state-not-restored'], { violations: Object.freeze(after.map((n) => `after:${n}`)), restored });
    return done('passed', ['steady-state-held'], { restored });
};
//# sourceMappingURL=chaos-validation.js.map