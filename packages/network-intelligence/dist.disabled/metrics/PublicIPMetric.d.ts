import type { HTTPProvider } from '../providers/HTTPProvider.js';
export declare class PublicIPMetric {
    private readonly provider;
    private readonly url;
    constructor(provider: HTTPProvider, url: string);
    measure(signal: AbortSignal): Promise<string | null>;
}
//# sourceMappingURL=PublicIPMetric.d.ts.map