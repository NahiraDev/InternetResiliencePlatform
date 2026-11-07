/**
 * Phase 94 — Traffic Classification.
 *
 * Pure, deterministic classification of observed flows into traffic classes and
 * application identities. The output feeds the existing routing vocabulary
 * (`routing.application`) consumed by `ProgrammableConnectivityFabric.select`;
 * classification itself never selects or mutates a route.
 */
export declare const TRAFFIC_CLASSES: readonly ["realtime", "interactive", "streaming", "bulk", "background", "control", "unknown"];
export type TrafficClass = (typeof TRAFFIC_CLASSES)[number];
export type TrafficProtocol = 'tcp' | 'udp' | 'icmp' | 'quic' | 'other';
export interface FlowDescriptor {
    readonly flowId: string;
    readonly protocol: TrafficProtocol;
    readonly destinationPort?: number;
    readonly destinationHost?: string;
    readonly sourceTenant?: string;
    readonly bytesPerSecond?: number;
    readonly packetsPerSecond?: number;
    readonly meanPacketBytes?: number;
    readonly dscp?: number;
    readonly applicationHint?: string;
}
export interface ClassificationRule {
    readonly id: string;
    /** Lower number is evaluated first; ties break on rule id. */
    readonly priority: number;
    readonly trafficClass: TrafficClass;
    readonly application?: string;
    readonly protocols?: readonly TrafficProtocol[];
    readonly ports?: readonly number[];
    readonly portRange?: readonly [number, number];
    /** Exact host or `*.suffix` wildcard. */
    readonly hosts?: readonly string[];
    readonly dscp?: readonly number[];
    readonly minBytesPerSecond?: number;
    readonly maxBytesPerSecond?: number;
    readonly maxMeanPacketBytes?: number;
    readonly minPacketsPerSecond?: number;
    readonly confidence: number;
}
export interface TrafficClassification {
    readonly flowId: string;
    readonly trafficClass: TrafficClass;
    readonly application?: string;
    readonly ruleId?: string;
    readonly confidence: number;
    readonly basis: 'rule' | 'hint' | 'heuristic' | 'default';
    readonly reasons: readonly string[];
}
export declare class ClassificationRuleError extends Error {
    readonly ruleId: string;
    constructor(ruleId: string, message: string);
}
export declare const validateClassificationRules: (rules: readonly ClassificationRule[]) => readonly ClassificationRule[];
/** Conservative built-in rules; deployments may supply their own. */
export declare const DEFAULT_CLASSIFICATION_RULES: readonly ClassificationRule[];
/** Classifies one flow. Evaluation order: explicit rules, application hint, heuristics, default. */
export declare const classifyFlow: (flow: FlowDescriptor, rules?: readonly ClassificationRule[]) => TrafficClassification;
export declare const classifyFlows: (flows: readonly FlowDescriptor[], rules?: readonly ClassificationRule[]) => readonly TrafficClassification[];
export interface TrafficMix {
    readonly total: number;
    readonly byClass: Readonly<Record<TrafficClass, number>>;
    readonly byApplication: Readonly<Record<string, number>>;
    readonly unclassifiedRatio: number;
}
export declare const summarizeTrafficMix: (classifications: readonly TrafficClassification[]) => TrafficMix;
/**
 * Compiles a classification into the bounded `routing.*` vocabulary understood
 * by the fabric. The result is read-only evidence; it grants no authority.
 */
export declare const routingHintsFromClassification: (classification: TrafficClassification) => Readonly<Record<string, string>>;
//# sourceMappingURL=classification.d.ts.map