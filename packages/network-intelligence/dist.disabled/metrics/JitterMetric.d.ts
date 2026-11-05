import type { PingProvider } from '../providers/PingProvider.js';
export declare class JitterMetric {
    private readonly provider;
    private readonly host;
    private readonly attempts;
    constructor(provider: PingProvider, host: string, attempts: number);
    measure(signal: AbortSignal): Promise<number | null>;
}
//# sourceMappingURL=JitterMetric.d.ts.map