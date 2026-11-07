import type { GatewayHealth, GatewayHealthStatus, GatewayProbeEvidence } from './health.js';
import type { GatewayMetadata } from './index.js';
export type GatewaySelectionRejectionReason = 'not-active' | 'not-trusted' | 'health-unacceptable' | 'stale-health' | 'insufficient-evidence' | 'capacity-unavailable' | 'capacity-limit' | 'policy-denied' | 'region-not-allowed' | 'provider-not-allowed' | 'tag-missing' | 'protocol-missing' | 'address-family-missing';
export interface GatewayCapacity {
    utilizationPercent: number;
    availableCapacityPercent?: number;
    checkedAt: string;
}
export interface GatewaySelectionPolicy {
    allowedRegions: string[];
    allowedProviderIds: string[];
    requiredTags: string[];
    requiredTunnelProtocol?: string;
    requiredAddressFamily?: 'ipv4' | 'ipv6' | 'dual';
    /**
     * Minimum evidence a gateway's health must be based on to be selectable.
     *
     * When unset, evidence is not part of the decision (the historical behaviour). When set, a
     * gateway whose health was only established at a weaker level is rejected with
     * `insufficient-evidence` — for example `transport` evidence (a TCP connect) can never make a
     * gateway selectable when `protocol` is required.
     */
    minimumHealthEvidence?: GatewayProbeEvidence;
    minimumHealthScore: number;
    maximumLatencyMs: number;
    maximumPacketLossPercent: number;
    maximumUtilizationPercent: number;
    requireFreshHealth: boolean;
    maxHealthAgeMs: number;
    allowDegradedHealth: boolean;
    preferredRegions: string[];
    preferredProviderIds: string[];
    hysteresisScore: number;
}
export declare const DEFAULT_GATEWAY_SELECTION_POLICY: GatewaySelectionPolicy;
export interface GatewaySelectionCandidate {
    gateway: GatewayMetadata;
    health: GatewayHealth;
    capacity?: GatewayCapacity;
    eligible: boolean;
    score: number;
    rejectionReason?: GatewaySelectionRejectionReason;
    explanation: string[];
    scoreComponents: Record<string, number>;
}
export interface GatewaySelectionRequest {
    gateways: GatewayMetadata[];
    health: Map<string, GatewayHealth> | Record<string, GatewayHealth>;
    capacity?: Map<string, GatewayCapacity> | Record<string, GatewayCapacity> | undefined;
    currentGatewayId?: string;
    policy?: Partial<GatewaySelectionPolicy>;
    now?: Date;
}
export interface GatewaySelectionResult {
    selected?: GatewaySelectionCandidate;
    candidates: GatewaySelectionCandidate[];
    reason: string;
    switched: boolean;
}
/** True when `actual` is at least as strong as `required`. */
export declare function gatewayEvidenceMeets(actual: GatewayProbeEvidence, required: GatewayProbeEvidence): boolean;
export declare function selectGateway(request: GatewaySelectionRequest): GatewaySelectionResult;
export declare function gatewayHealthStatusIsSelectable(status: GatewayHealthStatus, allowDegradedHealth: boolean): boolean;
//# sourceMappingURL=selection.d.ts.map