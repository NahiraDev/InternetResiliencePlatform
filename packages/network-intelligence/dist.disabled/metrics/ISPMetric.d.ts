import type { HTTPProvider } from '../providers/HTTPProvider.js';
export declare class ISPMetric {
    private readonly provider;
    private readonly url;
    constructor(provider: HTTPProvider, url: string);
    measure(signal: AbortSignal): Promise<string | null>;
}
//# sourceMappingURL=ISPMetric.d.ts.map