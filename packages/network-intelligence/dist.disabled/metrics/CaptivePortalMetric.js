/** A redirect is evidence of a captive-portal signal, not proof of filtering. */
export class CaptivePortalMetric {
    provider;
    probeUrl;
    constructor(provider, probeUrl) {
        this.provider = provider;
        this.probeUrl = probeUrl;
    }
    async measure(signal) {
        const result = await this.provider.request(this.probeUrl, signal);
        const redirected = result.statusCode >= 300 && result.statusCode < 400;
        return { captive: redirected, redirected, statusCode: result.statusCode };
    }
}
//# sourceMappingURL=CaptivePortalMetric.js.map