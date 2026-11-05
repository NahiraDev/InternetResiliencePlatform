export class BandwidthMetric {
    provider;
    url;
    constructor(provider, url) {
        this.provider = provider;
        this.url = url;
    }
    async measure(signal) {
        return (await this.provider.bandwidth(this.url, signal)).mbps;
    }
}
//# sourceMappingURL=BandwidthMetric.js.map