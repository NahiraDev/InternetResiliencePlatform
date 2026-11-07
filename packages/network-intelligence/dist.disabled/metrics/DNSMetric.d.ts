import type { DNSProvider } from '../providers/DNSProvider.js';
export declare class DNSMetric {
    private readonly provider;
    private readonly host;
    constructor(provider: DNSProvider, host: string);
    measure(signal: AbortSignal): Promise<number | null>;
}
//# sourceMappingURL=DNSMetric.d.ts.map