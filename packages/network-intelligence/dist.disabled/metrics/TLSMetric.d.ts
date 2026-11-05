import type { HTTPProvider } from '../providers/HTTPProvider.js';
export declare class TLSMetric {
    private readonly provider;
    private readonly url;
    constructor(provider: HTTPProvider, url: string);
    measure(signal: AbortSignal): Promise<number | null>;
}
//# sourceMappingURL=TLSMetric.d.ts.map