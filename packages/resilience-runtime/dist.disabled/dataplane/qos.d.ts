/**
 * Phase 130 — QoS, Priority & Traffic Engineering.
 *
 * Deterministic bandwidth allocation for traffic classes over a path of finite
 * capacity: guaranteed minimums first, then weighted max-min fair sharing with
 * per-class ceilings (water-filling), with strict-priority protection for
 * realtime and control traffic. The result is a plan; enforcement is a data-plane
 * rule (rate-limit/mark) compiled through Phase 128.
 */
import type { TrafficClass } from '../traffic/classification.js';
import type { DataPlaneRule } from './abstraction.js';
export interface QosClassPolicy {
    readonly trafficClass: TrafficClass;
    /** Strict-priority tier; lower is served first. */
    readonly tier: number;
    readonly weight: number;
    readonly guaranteedKbps: number;
    readonly ceilingKbps?: number;
    readonly dscp: number;
}
export declare const DEFAULT_QOS_POLICIES: readonly QosClassPolicy[];
export interface QosDemand {
    readonly trafficClass: TrafficClass;
    readonly demandKbps: number;
}
export interface QosAllocation {
    readonly trafficClass: TrafficClass;
    readonly allocatedKbps: number;
    readonly demandKbps: number;
    readonly satisfied: boolean;
    readonly limitedBy: 'none' | 'capacity' | 'ceiling' | 'demand';
}
export interface QosPlan {
    readonly capacityKbps: number;
    readonly allocations: readonly QosAllocation[];
    readonly utilization: number;
    readonly oversubscribed: boolean;
    readonly unmetGuarantees: readonly TrafficClass[];
}
export declare class QosConfigError extends Error {
    constructor(message: string);
}
export declare const allocateBandwidth: (capacityKbps: number, demands: readonly QosDemand[], policies?: readonly QosClassPolicy[]) => QosPlan;
/** Compiles an allocation into mark + rate-limit rules for the data-plane abstraction. */
export declare const qosRules: (plan: QosPlan, owner: string, pathId: string, policies?: readonly QosClassPolicy[], markBase?: number) => readonly DataPlaneRule[];
//# sourceMappingURL=qos.d.ts.map