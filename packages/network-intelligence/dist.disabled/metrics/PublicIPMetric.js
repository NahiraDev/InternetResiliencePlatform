export class PublicIPMetric {
    provider;
    url;
    constructor(provider, url) {
        this.provider = provider;
        this.url = url;
    }
    async measure(signal) {
        return (await this.provider.publicIp(this.url, signal)).ip;
    }
}
//# sourceMappingURL=PublicIPMetric.js.map