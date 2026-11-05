import { standardDeviation } from '../utils/Statistics.js';
export class JitterMetric {
    provider;
    host;
    attempts;
    constructor(provider, host, attempts) {
        this.provider = provider;
        this.host = host;
        this.attempts = attempts;
    }
    async measure(signal) {
        const values = [];
        for (let i = 0; i < this.attempts; i += 1) {
            const r = await this.provider.ping(this.host, signal);
            if (r.success)
                values.push(r.latencyMs);
        }
        return standardDeviation(values);
    }
}
//# sourceMappingURL=JitterMetric.js.map