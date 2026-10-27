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
] as const;

export type HealthScope = (typeof HEALTH_SCOPES)[number];

export type ScopedHealthStatus = 'healthy' | 'degraded' | 'failed' | 'unknown' | 'stale';

export interface ScopedHealthSignal {
  readonly scope: HealthScope;
  readonly subjectId: string;
  readonly status: ScopedHealthStatus;
  /** Confidence in this measurement in [0,1]. */
  readonly confidence: number;
  readonly observedAt: string;
  /** Optional failure domain this signal belongs to. */
  readonly failureDomain?: string;
  readonly detail?: Readonly<Record<string, string | number | boolean>>;
}

export interface HealthReport {
  readonly byScope: Readonly<Record<HealthScope, ScopedHealthStatus>>;
  /** Worst status across all scopes: the aggregate verdict. */
  readonly overall: ScopedHealthStatus;
  readonly signals: readonly ScopedHealthSignal[];
  /** Scopes that are not healthy, with their subject. */
  readonly degradedScopes: readonly { readonly scope: HealthScope; readonly subjectId: string }[];
}

const SEVERITY_ORDER: Readonly<Record<ScopedHealthStatus, number>> = Object.freeze({
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
export const buildHealthReport = (signals: readonly ScopedHealthSignal[]): HealthReport => {
  const byScope = {} as Record<HealthScope, ScopedHealthStatus>;
  for (const scope of HEALTH_SCOPES) {
    const scoped = signals.filter((signal) => signal.scope === scope);
    if (scoped.length === 0) {
      byScope[scope] = 'unknown';
      continue;
    }
    // Worst observed status wins: one failed destination must not be averaged
    // away by healthy signals elsewhere.
    byScope[scope] = scoped.reduce<ScopedHealthStatus>(
      (worst, signal) =>
        SEVERITY_ORDER[signal.status] > SEVERITY_ORDER[worst] ? signal.status : worst,
      'healthy',
    );
  }
  const overall = HEALTH_SCOPES.reduce<ScopedHealthStatus>(
    (worst, scope) => (SEVERITY_ORDER[byScope[scope]] > SEVERITY_ORDER[worst] ? byScope[scope] : worst),
    'healthy',
  );
  return deepFreeze({
    byScope: Object.freeze(byScope),
    overall,
    signals: Object.freeze([...signals].sort((a, b) => a.scope.localeCompare(b.scope))),
    degradedScopes: Object.freeze(
      signals
        .filter((signal) => signal.status === 'degraded' || signal.status === 'failed')
        .map((signal) => ({ scope: signal.scope, subjectId: signal.subjectId }))
        .sort((a, b) => a.scope.localeCompare(b.scope) || a.subjectId.localeCompare(b.subjectId)),
    ),
  });
};

/** Probe port for real destination/service/application outcomes. */
export interface OutcomeProbe {
  readonly scope: 'destination' | 'service' | 'application';
  readonly subjectId: string;
  /**
   * Performs the probe. Must throw or resolve to a non-success status when the
   * subject is not actually reachable.
   */
  probe: () => Promise<{ readonly reachable: boolean; readonly latencyMs?: number; readonly detail?: Readonly<Record<string, string | number | boolean>> }>;
}

export interface OutcomeVerificationInput {
  readonly correlationId: string;
  readonly planId: string;
  readonly transactionId?: string;
  readonly mutationId?: string;
  readonly expectedPostconditions: readonly string[];
  /** Return code from the action itself. Not sufficient on its own. */
  readonly actionStatus: string;
  readonly probes: readonly OutcomeProbe[];
  readonly rollbackVerification?: boolean;
}

export interface OutcomeVerificationResult {
  readonly id: string;
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly correlationId: string;
  readonly source: 'resilience-runtime';
  readonly metadata: Readonly<Record<string, unknown>>;
  /** True only when every probe and postcondition succeeded. */
  readonly outcomeVerified: boolean;
  /** True when the action returned success but the real outcome did not. */
  readonly actionSucceededButOutcomeFailed: boolean;
  readonly health: HealthReport;
  readonly probeResults: readonly {
    readonly scope: 'destination' | 'service' | 'application';
    readonly subjectId: string;
    readonly reachable: boolean;
    readonly latencyMs?: number;
    readonly error?: string;
  }[];
  readonly verifiedPostconditions: readonly string[];
  readonly failedPostconditions: readonly string[];
  readonly terminal: boolean;
}

const probeSignalStatus = (reachable: boolean): ScopedHealthStatus => (reachable ? 'healthy' : 'failed');

/**
 * Verifies the real outcome of a mutation.
 *
 * An action reporting `success` is **not** treated as proof. Every supplied
 * probe must succeed. When no probes are supplied the result is explicitly
 * `unverified` rather than `verified`, so an unverified mutation cannot be
 * recorded as an outcome that supports learning.
 */
export const verifyOutcome = async (
  input: OutcomeVerificationInput,
  nowMs: number = Date.now(),
): Promise<OutcomeVerificationResult> => {
  const observedAt = new Date(nowMs).toISOString();
  const probeResults: {
    scope: 'destination' | 'service' | 'application';
    subjectId: string;
    reachable: boolean;
    latencyMs?: number;
    error?: string;
  }[] = [];

  for (const probe of [...input.probes].sort((a, b) => a.scope.localeCompare(b.scope) || a.subjectId.localeCompare(b.subjectId))) {
    try {
      const result = await probe.probe();
      probeResults.push({
        scope: probe.scope,
        subjectId: probe.subjectId,
        reachable: result.reachable,
        ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
      });
    } catch (error) {
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

  const signals: ScopedHealthSignal[] = probeResults.map((result) => ({
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
  const failedPostconditions =
    failedProbes.length === 0 && actionSucceeded
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