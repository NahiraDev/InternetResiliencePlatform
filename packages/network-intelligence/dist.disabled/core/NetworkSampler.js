import { NetworkSnapshot } from '../models/NetworkSnapshot.js';
import { calculateQualityScore } from '../models/QualityScore.js';
import { withTimeout } from '../utils/Timeout.js';
import { retry } from '../utils/Retry.js';
import { LatencyMetric } from '../metrics/LatencyMetric.js';
import { JitterMetric } from '../metrics/JitterMetric.js';
import { PacketLossMetric } from '../metrics/PacketLossMetric.js';
import { DNSMetric } from '../metrics/DNSMetric.js';
import { HTTPMetric } from '../metrics/HTTPMetric.js';
import { TLSMetric } from '../metrics/TLSMetric.js';
import { BandwidthMetric } from '../metrics/BandwidthMetric.js';
import { GatewayMetric } from '../metrics/GatewayMetric.js';
export const DEFAULT_SAMPLER_OPTIONS = {
    pingHost: '1.1.1.1',
    dnsHost: 'example.com',
    httpUrl: 'http://example.com',
    httpsUrl: 'https://example.com',
    publicIpUrl: 'https://ipinfo.io/json',
    bandwidthUrl: 'https://example.com',
    gatewayHost: '192.168.1.1',
    pingAttempts: 4,
    timeoutMs: 3000,
    retry: { attempts: 2, delayMs: 25 },
    networkTypeDetector: () => 'unknown',
    now: () => new Date().toISOString(),
};
export class NetworkSampler {
    providers;
    options;
    constructor(providers, options = DEFAULT_SAMPLER_OPTIONS) {
        this.providers = providers;
        this.options = options;
    }
    async sample(signal) {
        const run = (op) => retry(() => withTimeout(op, this.options.timeoutMs, signal), this.options.retry, signal);
        const publicInfo = await run((s) => this.providers.http.publicIp(this.options.publicIpUrl, s)).catch(() => ({ ip: null, asn: null, isp: null }));
        const latencyMs = await run((s) => new LatencyMetric(this.providers.ping, this.options.pingHost).measure(s)).catch(() => null);
        const jitterMs = await run((s) => new JitterMetric(this.providers.ping, this.options.pingHost, this.options.pingAttempts).measure(s)).catch(() => null);
        const packetLossRatio = await run((s) => new PacketLossMetric(this.providers.ping, this.options.pingHost, this.options.pingAttempts).measure(s)).catch(() => 1);
        const dnsLookupMs = await run((s) => new DNSMetric(this.providers.dns, this.options.dnsHost).measure(s)).catch(() => null);
        const httpResponseMs = await run((s) => new HTTPMetric(this.providers.http, this.options.httpUrl).measure(s)).catch(() => null);
        const httpsHandshakeMs = await run((s) => new TLSMetric(this.providers.http, this.options.httpsUrl).measure(s)).catch(() => null);
        const bandwidthMbps = await run((s) => new BandwidthMetric(this.providers.http, this.options.bandwidthUrl).measure(s)).catch(() => null);
        const gatewayReachable = await run((s) => new GatewayMetric(this.providers.ping, this.options.gatewayHost).measure(s)).catch(() => false);
        const ipv4Connectivity = latencyMs !== null || gatewayReachable;
        const ipv6Connectivity = false;
        const internetReachable = packetLossRatio < 1 &&
            (dnsLookupMs !== null || httpResponseMs !== null || httpsHandshakeMs !== null);
        const base = {
            latencyMs,
            jitterMs,
            packetLossRatio,
            dnsLookupMs,
            httpResponseMs,
            httpsHandshakeMs,
            ipv4Connectivity,
            ipv6Connectivity,
            publicIp: publicInfo.ip,
            asn: publicInfo.asn,
            isp: publicInfo.isp,
            networkType: this.options.networkTypeDetector(),
            gatewayReachable,
            internetReachable,
            bandwidthMbps,
        };
        return new NetworkSnapshot({
            ...base,
            qualityScore: calculateQualityScore(base),
            timestamp: this.options.now(),
        });
    }
}
//# sourceMappingURL=NetworkSampler.js.map