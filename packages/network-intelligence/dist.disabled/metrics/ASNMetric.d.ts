import type { HTTPProvider } from '../providers/HTTPProvider.js';
export declare class ASNMetric {
    private readonly provider;
    private readonly url;
    constructor(provider: HTTPProvider, url: string);
    measure(signal: AbortSignal): Promise<number | null>;
}
//# sourceMappingURL=ASNMetric.d.ts.map