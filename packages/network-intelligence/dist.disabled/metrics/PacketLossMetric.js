import { packetLossRatio } from '../utils/Statistics.js';
export class PacketLossMetric {
    provider;
    host;
    attempts;
    constructor(provider, host, attempts) {
        this.provider = provider;
        this.host = host;
        this.attempts = attempts;
    }
    async measure(signal) {
        const results = [];
        for (let i = 0; i < this.attempts; i += 1) {
            results.push((await this.provider.ping(this.host, signal)).success);
        }
        return packetLossRatio(results);
    }
}
//# sourceMappingURL=PacketLossMetric.js.map