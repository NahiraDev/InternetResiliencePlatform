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
/**
 * Named `ScopedHealth*` rather than `HealthSignal`/`HealthStatus`: `@irp/failover`
 * and `@irp/telemetry` already export types with those names and different
 * shapes. Three different `HealthStatus` meanings in one runtime is the exact
 * ambiguity the archaeology drift register exists to prevent.
 */
export declare const HEALTH_SCOPES: readonly ["resource", "path", "destination", "service", "application", "workload", "transport", "region", "provider"];
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
    readonly degradedScopes: readonly {
        readonly scope: HealthScope;
        readonly subjectId: string;
    }[];
}
/**
 * Rolls per-scope signals into a report. A scope with no signal is `unknown`,
 * never silently `healthy` — missing evidence is not good news.
 */
export declare const buildHealthReport: (signals: readonly ScopedHealthSignal[]) => HealthReport;
/** Probe port for real destination/service/application outcomes. */
export interface OutcomeProbe {
    readonly scope: 'destination' | 'service' | 'application';
    readonly subjectId: string;
    /**
     * Performs the probe. Must throw or resolve to a non-success status when the
     * subject is not actually reachable.
     */
    probe: () => Promise<{
        readonly reachable: boolean;
        readonly latencyMs?: number;
        readonly detail?: Readonly<Record<string, string | number | boolean>>;
    }>;
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
/**
 * Verifies the real outcome of a mutation.
 *
 * An action reporting `success` is **not** treated as proof. Every supplied
 * probe must succeed. When no probes are supplied the result is explicitly
 * `unverified` rather than `verified`, so an unverified mutation cannot be
 * recorded as an outcome that supports learning.
 */
export declare const verifyOutcome: (input: OutcomeVerificationInput, nowMs?: number) => Promise<OutcomeVerificationResult>;
//# sourceMappingURL=outcome-verification.d.ts.map