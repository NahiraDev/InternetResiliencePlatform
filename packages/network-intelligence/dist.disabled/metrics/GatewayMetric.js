export class GatewayMetric {
    provider;
    gatewayHost;
    constructor(provider, gatewayHost) {
        this.provider = provider;
        this.gatewayHost = gatewayHost;
    }
    async measure(signal) {
        return (await this.provider.ping(this.gatewayHost, signal)).success;
    }
}
//# sourceMappingURL=GatewayMetric.js.map