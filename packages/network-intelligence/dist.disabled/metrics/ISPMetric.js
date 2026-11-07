export class ISPMetric {
    provider;
    url;
    constructor(provider, url) {
        this.provider = provider;
        this.url = url;
    }
    async measure(signal) {
        return (await this.provider.publicIp(this.url, signal)).isp;
    }
}
//# sourceMappingURL=ISPMetric.js.map