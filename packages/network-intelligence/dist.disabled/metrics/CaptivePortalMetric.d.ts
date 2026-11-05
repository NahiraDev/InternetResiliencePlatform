import type { HTTPProvider } from '../providers/HTTPProvider.js';
export interface CaptivePortalResult {
    captive: boolean;
    redirected: boolean;
    statusCode: number;
}
/** A redirect is evidence of a captive-portal signal, not proof of filtering. */
export declare class CaptivePortalMetric {
    private readonly provider;
    private readonly probeUrl;
    constructor(provider: HTTPProvider, probeUrl: string);
    measure(signal: AbortSignal): Promise<CaptivePortalResult>;
}
//# sourceMappingURL=CaptivePortalMetric.d.ts.map