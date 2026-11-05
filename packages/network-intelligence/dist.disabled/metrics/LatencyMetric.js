export class LatencyMetric {
    provider;
    host;
    constructor(provider, host) {
        this.provider = provider;
        this.host = host;
    }
    async measure(signal) {
        const r = await this.provider.ping(this.host, signal);
        return r.success ? r.latencyMs : null;
    }
}
//# sourceMappingURL=LatencyMetric.js.map