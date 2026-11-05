export class HTTPMetric {
    provider;
    url;
    constructor(provider, url) {
        this.provider = provider;
        this.url = url;
    }
    async measure(signal) {
        const r = await this.provider.request(this.url, signal);
        return r.statusCode >= 200 && r.statusCode < 500 ? r.responseMs : null;
    }
}
//# sourceMappingURL=HTTPMetric.js.map