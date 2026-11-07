export class ASNMetric {
    provider;
    url;
    constructor(provider, url) {
        this.provider = provider;
        this.url = url;
    }
    async measure(signal) {
        return (await this.provider.publicIp(this.url, signal)).asn;
    }
}
//# sourceMappingURL=ASNMetric.js.map