export class NetworkSnapshot {
    latencyMs;
    jitterMs;
    packetLossRatio;
    dnsLookupMs;
    httpResponseMs;
    httpsHandshakeMs;
    ipv4Connectivity;
    ipv6Connectivity;
    publicIp;
    asn;
    isp;
    networkType;
    gatewayReachable;
    internetReachable;
    bandwidthMbps;
    qualityScore;
    timestamp;
    constructor(input) {
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
//# sourceMappingURL=NetworkSnapshot.js.map