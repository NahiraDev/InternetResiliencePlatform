export class TLSMetric {
    provider;
    url;
    constructor(provider, url) {
        this.provider = provider;
        this.url = url;
    }
    async measure(signal) {
        const r = await this.provider.tlsHandshake(this.url, signal);
        return r.authorized ? r.handshakeMs : null;
    }
}
//# sourceMappingURL=TLSMetric.js.map