/**
 * Operator-facing interpretation of what the daemon reports.
 *
 * These are pure functions of the daemon's own responses. They add no claims of their own: every
 * finding names the field it came from, and "healthy" requires positive evidence, never just the
 * absence of errors.
 */

export const EXIT = { ok: 0, error: 1, degraded: 2, unreachable: 3, blocked: 4 } as const;

export type OverallState = 'healthy' | 'degraded' | 'blocked' | 'unknown' | 'unreachable';

export interface Finding {
  readonly level: 'error' | 'warning' | 'info';
  readonly code: string;
  readonly message: string;
  readonly hint?: string;
}

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (typeof value === 'object' && value !== null ? (value as Json) : {});
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

export interface DecisionSummary {
  readonly decisionId: string | null;
  readonly at: string | null;
  readonly mode: string | null;
  readonly outcome: string | null;
  readonly action: string | null;
  /** Why the runtime refused to act, taken from the policy evaluation. */
  readonly blockedBecause: readonly string[];
  /** none | simulated | executed | failed | skipped */
  readonly execution: string;
  /** none | verified | failed | partial | skipped */
  readonly verification: string;
  /** True only for a real (non-simulated) execution whose postconditions were verified. */
  readonly executedAndVerified: boolean;
}

export const summarizeDecision = (record: unknown): DecisionSummary => {
  const r = obj(record);
  const policy = obj(r.policyEvaluation);
  const plan = obj(r.selectedPlan);
  const exec = obj(r.executionResult);
  const verify = obj(r.verificationResult);
  const hasExec = Object.keys(exec).length > 0;
  const hasVerify = Object.keys(verify).length > 0;
  let execution = 'none';
  if (hasExec) {
    if (exec.status === 'failed') execution = 'failed';
    else if (exec.status === 'skipped') execution = 'skipped';
    else execution = exec.simulated === true ? 'simulated' : 'executed';
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
    blockedBecause: policy.allowed === false ? arr(policy.reasons).filter((x): x is string => typeof x === 'string') : [],
    execution,
    verification,
    executedAndVerified: execution === 'executed' && verification === 'verified',
  };
};

export interface Assessment {
  readonly state: OverallState;
  readonly exitCode: number;
  readonly findings: readonly Finding[];
  readonly summary: {
    readonly lifecycle: string | null;
    readonly requestedMode: string | null;
    readonly effectiveMode: string | null;
    readonly liveActive: boolean | null;
    readonly periodicCycles: boolean | null;
    readonly storage: 'persistent' | 'in-memory' | 'unknown';
    readonly runtimeHealth: string | null;
    readonly lastDecision: DecisionSummary | null;
  };
}

export const assessDaemon = (input: { health: unknown; snapshot: unknown; decisions: unknown }): Assessment => {
  const health = obj(input.health);
  const auth = obj(health.authorization);
  const storage = obj(health.storage);
  const scheduler = obj(health.scheduler);
  const runtimeHealth = obj(obj(input.snapshot).health);
  const decisions = arr(input.decisions);
  const last = decisions.length ? summarizeDecision(decisions[decisions.length - 1]) : null;
  const findings: Finding[] = [];

  const lifecycle = str(health.lifecycle) ?? null;
  if (lifecycle !== 'running' && lifecycle !== 'ready')
    findings.push({ level: 'error', code: 'lifecycle', message: `daemon lifecycle is ${lifecycle ?? 'unknown'}, not running` });

  const blockers = arr(auth.blockers).filter((x): x is string => typeof x === 'string');
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

  let state: OverallState;
  let exitCode: number;
  if (last?.outcome === 'blocked') ({ state, exitCode } = { state: 'blocked', exitCode: EXIT.blocked });
  else if (findings.some((f) => f.level === 'error') || rh === 'failed') ({ state, exitCode } = { state: 'degraded', exitCode: EXIT.degraded });
  else if (findings.some((f) => f.level === 'warning')) ({ state, exitCode } = { state: rh === 'healthy' ? 'degraded' : 'unknown', exitCode: EXIT.degraded });
  else ({ state, exitCode } = { state: 'healthy', exitCode: EXIT.ok });
  // Positive evidence is mandatory for "healthy".
  if (state === 'healthy' && rh !== 'healthy') ({ state, exitCode } = { state: 'unknown', exitCode: EXIT.degraded });

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
      storage: storageKind as 'persistent' | 'in-memory' | 'unknown',
      runtimeHealth: rh,
      lastDecision: last,
    },
  };
};
