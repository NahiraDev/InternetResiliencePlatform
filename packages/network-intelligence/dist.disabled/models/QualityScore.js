export const DEFAULT_QUALITY_WEIGHTS = {
    latency: 20,
    packetLoss: 25,
    jitter: 15,
    dns: 10,
    http: 10,
    bandwidth: 10,
    reachability: 10,
};
const clamp = (value) => Math.max(0, Math.min(100, value));
const scoreLowerBetter = (value, excellent, unusable) => value === null ? 0 : clamp(100 - ((value - excellent) / (unusable - excellent)) * 100);
export const calculateQualityScore = (metrics, weights = DEFAULT_QUALITY_WEIGHTS) => {
    const latency = scoreLowerBetter(metrics.latencyMs, 30, 500);
    const jitter = scoreLowerBetter(metrics.jitterMs, 5, 150);
    const dns = scoreLowerBetter(metrics.dnsLookupMs, 20, 500);
    const http = scoreLowerBetter(metrics.httpResponseMs, 100, 2000);
    const bandwidth = metrics.bandwidthMbps === null ? 0 : clamp((metrics.bandwidthMbps / 25) * 100);
    const packetLoss = clamp(100 - metrics.packetLossRatio * 1000);
    const reachability = (metrics.internetReachable ? 60 : 0) +
        (metrics.gatewayReachable ? 20 : 0) +
        (metrics.ipv4Connectivity ? 10 : 0) +
        (metrics.ipv6Connectivity ? 10 : 0);
    const weighted = latency * weights.latency +
        packetLoss * weights.packetLoss +
        jitter * weights.jitter +
        dns * weights.dns +
        http * weights.http +
        bandwidth * weights.bandwidth +
        reachability * weights.reachability;
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    return Math.round(clamp(weighted / total));
};
//# sourceMappingURL=QualityScore.js.map