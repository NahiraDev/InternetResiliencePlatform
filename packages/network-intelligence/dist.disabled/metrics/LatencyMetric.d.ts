import type { PingProvider } from '../providers/PingProvider.js';
export declare class LatencyMetric {
    private readonly provider;
    private readonly host;
    constructor(provider: PingProvider, host: string);
    measure(signal: AbortSignal): Promise<number | null>;
}
//# sourceMappingURL=LatencyMetric.d.ts.map