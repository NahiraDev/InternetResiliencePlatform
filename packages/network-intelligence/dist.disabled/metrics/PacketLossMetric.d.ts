import type { PingProvider } from '../providers/PingProvider.js';
export declare class PacketLossMetric {
    private readonly provider;
    private readonly host;
    private readonly attempts;
    constructor(provider: PingProvider, host: string, attempts: number);
    measure(signal: AbortSignal): Promise<number>;
}
//# sourceMappingURL=PacketLossMetric.d.ts.map