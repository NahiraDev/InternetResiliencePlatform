import type { GatewayEndpoint, GatewayId } from './index.js';
export type GatewayHealthStatus = 'healthy' | 'degraded' | 'unreachable' | 'stale' | 'unknown';
/**
 * What a health observation actually proved.
 *
 * The distinction is load-bearing: a gateway must never be reported operational merely
 * because a TCP connection succeeded or because a connectivity source was selected.
 *
 * - `transport`: the endpoint's transport answered (for example a TCP connect succeeded, or a
 *   UDP datagram could be emitted). This proves the address is reachable and nothing else.
 * - `protocol`: the tunnel protocol itself completed a valid exchange (for example a fresh
 *   WireGuard handshake). This proves the peer speaks the protocol and shares the session keys.
 * - `egress`: traffic actually left the host through this gateway and reached an external
 *   destination. This is the strongest evidence and the only one that may describe a gateway
 *   as operational.
 *
 * Evidence that is absent proves nothing stronger than `transport`, so evaluation treats an
 * absent value as `transport` and fails closed.
 */
export type GatewayProbeEvidence = 'transport' | 'protocol' | 'egress';
export interface GatewayHealthSample {
    gatewayId: GatewayId;
    checkedAt: string;
    reachable: boolean;
    /** What the observation proved. Absent means "no stronger than transport". */
    evidence?: GatewayProbeEvidence;
    /**
     * `false` when the probe cannot speak the gateway's transport at all (for example a TCP probe
     * aimed at a UDP-only tunnel peer). Such an observation carries no evidence and must not be
     * reported as an unreachable gateway.
     */
    applicable?: boolean;
    latencyMs?: number;
    packetLossPercent?: number;
}
export interface GatewayHealthPolicy {
    maxStalenessMs: number;
    healthyLatencyMs: number;
    degradedLatencyMs: number;
    healthyPacketLossPercent: number;
    degradedPacketLossPercent: number;
}
export interface GatewayHealth {
    gatewayId: GatewayId;
    status: GatewayHealthStatus;
    score: number;
    checkedAt?: string;
    /** What the underlying observation proved. */
    evidence?: GatewayProbeEvidence;
    latencyMs?: number;
    packetLossPercent?: number;
    reason: string;
}
export interface GatewayHealthProbe {
    /**
     * The transport this probe speaks. `undefined` means the probe is transport agnostic.
     *
     * A selection plane uses this to refuse a probe that cannot speak a gateway's transport: a TCP
     * probe aimed at a UDP-only tunnel peer would otherwise report a healthy peer as unreachable.
     */
    readonly transport?: 'tcp' | 'udp' | 'any';
    probe(endpoint: GatewayEndpoint, timeoutMs: number): Promise<GatewayProbeResult>;
    probeGateways?(gateways: {
        id: string;
        endpoint: GatewayEndpoint;
    }[]): Promise<GatewayHealthSample[]>;
}
export interface GatewayProbeResult {
    reachable: boolean;
    /** What the probe proved. Absent means "no stronger than transport". */
    evidence?: GatewayProbeEvidence;
    /** `false` when the probe cannot speak this gateway's transport. */
    applicable?: boolean;
    latencyMs?: number;
    packetLossPercent?: number;
    error?: string;
    detail?: string;
}
export declare const DEFAULT_GATEWAY_HEALTH_POLICY: GatewayHealthPolicy;
export declare function evaluateGatewayHealth(sample: GatewayHealthSample, nowMs?: number, policy?: GatewayHealthPolicy): GatewayHealth;
export declare function probeGatewayHealth(gatewayId: GatewayId, endpoint: GatewayEndpoint, probe: GatewayHealthProbe, timeoutMs: number): Promise<GatewayHealthSample>;
//# sourceMappingURL=health.d.ts.map