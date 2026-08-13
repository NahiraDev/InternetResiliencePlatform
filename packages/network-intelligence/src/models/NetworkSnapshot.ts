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
export class NetworkSnapshot implements NetworkSnapshotInput {
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
  constructor(input: NetworkSnapshotInput) {
    this.latencyMs = input.latencyMs;
    this.jitterMs = input.jitterMs;
    this.packetLossRatio = input.packetLossRatio;
    this.dnsLookupMs = input.dnsLookupMs;
    this.httpResponseMs = input.httpResponseMs;
    this.httpsHandshakeMs = input.httpsHandshakeMs;
    this.ipv4Connectivity = input.ipv4Connectivity;
    this.ipv6Connectivity = input.ipv6Connectivity;
    this.publicIp = input.publicIp;
    this.asn = input.asn;
    this.isp = input.isp;
    this.networkType = input.networkType;
    this.gatewayReachable = input.gatewayReachable;
    this.internetReachable = input.internetReachable;
    this.bandwidthMbps = input.bandwidthMbps;
    this.qualityScore = input.qualityScore;
    this.timestamp = input.timestamp;
    Object.freeze(this);
  }
}
export type HistoryWindow = '1m' | '5m' | '30m' | '24h';
