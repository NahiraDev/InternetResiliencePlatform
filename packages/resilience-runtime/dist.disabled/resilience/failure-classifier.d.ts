/**
 * IRP-vs-network failure distinction for issue #283.
 * A misclassified internal fault looks like a network outage and triggers
 * the wrong recovery; this pure classifier keeps the distinction explicit.
 */
export type FailureClass = 'irp-internal' | 'network-external' | 'dependency-degraded' | 'unknown';
export interface FailureEvidence {
    /** The daemon/runtime itself errored (crash, exception, failed self-check). */
    readonly runtimeFault: boolean;
    /** Local self-health is degraded/critical independent of network state. */
    readonly selfUnhealthy: boolean;
    /** Network observations report degradation/failure. */
    readonly networkDegraded: boolean;
    /** An optional dependency (DB, telemetry, AI, federation, plugin) failed. */
    readonly dependencyFault: boolean;
}
export declare const classifyFailure: (evidence: FailureEvidence) => FailureClass;
//# sourceMappingURL=failure-classifier.d.ts.map