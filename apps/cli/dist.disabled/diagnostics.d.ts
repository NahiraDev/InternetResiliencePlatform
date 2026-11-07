/**
 * Operator-facing interpretation of what the daemon reports.
 *
 * These are pure functions of the daemon's own responses. They add no claims of their own: every
 * finding names the field it came from, and "healthy" requires positive evidence, never just the
 * absence of errors.
 */
export declare const EXIT: {
    readonly ok: 0;
    readonly error: 1;
    readonly degraded: 2;
    readonly unreachable: 3;
    readonly blocked: 4;
};
export type OverallState = 'healthy' | 'degraded' | 'blocked' | 'unknown' | 'unreachable';
export interface Finding {
    readonly level: 'error' | 'warning' | 'info';
    readonly code: string;
    readonly message: string;
    readonly hint?: string;
}
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
export declare const summarizeDecision: (record: unknown) => DecisionSummary;
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
export declare const assessDaemon: (input: {
    health: unknown;
    snapshot: unknown;
    decisions: unknown;
}) => Assessment;
//# sourceMappingURL=diagnostics.d.ts.map