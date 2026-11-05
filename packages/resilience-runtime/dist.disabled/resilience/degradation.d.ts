/**
 * Degradation matrix for issue #283.
 * Declares, per fault, whether the canonical loop may continue in local
 * autonomy and which fallback applies. Optional remote/AI/telemetry
 * outages must never halt local safety-preserving control.
 */
export type DegradationFault = 'daemon-crash' | 'partial-startup' | 'stale-runtime-state' | 'corrupt-runtime-state' | 'database-outage' | 'telemetry-outage' | 'plugin-crash' | 'malformed-config' | 'interrupted-transaction' | 'ai-unavailable' | 'federation-unavailable' | 'analytics-unavailable';
export type DegradationVerdict = 'continue-local' | 'continue-degraded' | 'halt';
export interface DegradationDecision {
    readonly verdict: DegradationVerdict;
    readonly fallback: string;
    readonly reason: string;
}
export declare const evaluateDegradation: (fault: DegradationFault) => DegradationDecision;
export declare const degradationFaults: readonly DegradationFault[];
//# sourceMappingURL=degradation.d.ts.map