/**
 * Failure/degradation fault catalog for issue #282.
 * Every fault maps to the observation evidence the canonical runtime already
 * understands; the lab never invents a parallel incident taxonomy.
 */
export type FaultKind = 'interface-failure' | 'provider-failure' | 'gateway-failure' | 'dns-failure' | 'route-failure' | 'tunnel-failure' | 'destination-failure' | 'latency-degradation' | 'jitter-degradation' | 'packet-loss' | 'throughput-degradation' | 'provider-switch' | 'path-change' | 'failure-domain-change' | 'federation-loss' | 'stale-decision' | 'concurrent-plans' | 'policy-change' | 'verification-failure' | 'rollback-failure';
export interface FaultSpec {
    readonly kind: FaultKind;
    /** Observation category emitted for this fault. */
    readonly category: string;
    /** Observation status emitted for this fault. */
    readonly status: 'failed' | 'degraded' | 'stale' | 'healthy';
    /** Extra observation metadata (deterministic; derived from the seed). */
    readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}
export declare const FAULT_CATALOG: Readonly<Record<FaultKind, FaultSpec>>;
export declare const faultKinds: readonly FaultKind[];
//# sourceMappingURL=faults.d.ts.map