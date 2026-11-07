export type NetworkType = 'wired' | 'wifi' | 'cellular' | 'loopback' | 'unknown';
export interface NetworkSnapshotInput {
    latencyMs: number | null;
    jitterMs: number | null;
    packetLossRatio: number;
    dnsLookupMs: number | null;
    httpResponseMs: number | null;
    httpsHandshakeMs: number | null;
    ipv4Connectivity: boolean;
    ipv6Connectivity: boolean;
    publicIp: string | null;
    asn: number | null;
    isp: string | null;
    networkType: NetworkType;
    gatewayReachable: boolean;
    internetReachable: boolean;
    bandwidthMbps: number | null;
    qualityScore: number;
    timestamp: string;
}
export declare class NetworkSnapshot implements NetworkSnapshotInput {
    readonly latencyMs: number | null;
    readonly jitterMs: number | null;
    readonly packetLossRatio: number;
    readonly dnsLookupMs: number | null;
    readonly httpResponseMs: number | null;
    readonly httpsHandshakeMs: number | null;
    readonly ipv4Connectivity: boolean;
    readonly ipv6Connectivity: boolean;
    readonly publicIp: string | null;
    readonly asn: number | null;
    readonly isp: string | null;
    readonly networkType: NetworkType;
    readonly gatewayReachable: boolean;
    readonly internetReachable: boolean;
    readonly bandwidthMbps: number | null;
    readonly qualityScore: number;
    readonly timestamp: string;
    constructor(input: NetworkSnapshotInput);
}
export type HistoryWindow = '1m' | '5m' | '30m' | '24h';
//# sourceMappingURL=NetworkSnapshot.d.ts.map