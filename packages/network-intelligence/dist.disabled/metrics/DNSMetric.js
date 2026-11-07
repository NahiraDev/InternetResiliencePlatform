export class DNSMetric {
    provider;
    host;
    constructor(provider, host) {
        this.provider = provider;
        this.host = host;
    }
    async measure(signal) {
        const r = await this.provider.lookup(this.host, signal);
        return r.addresses.length > 0 ? r.lookupMs : null;
    }
}
//# sourceMappingURL=DNSMetric.js.map