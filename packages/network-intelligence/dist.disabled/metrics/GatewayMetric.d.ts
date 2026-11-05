import type { PingProvider } from '../providers/PingProvider.js';
export declare class GatewayMetric {
    private readonly provider;
    private readonly gatewayHost;
    constructor(provider: PingProvider, gatewayHost: string);
    measure(signal: AbortSignal): Promise<boolean>;
}
//# sourceMappingURL=GatewayMetric.d.ts.map