import type { HTTPProvider } from '../providers/HTTPProvider.js';
export interface CaptivePortalResult { captive: boolean; redirected: boolean; statusCode: number; }
/** A redirect is evidence of a captive-portal signal, not proof of filtering. */
export class CaptivePortalMetric {
  constructor(private readonly provider: HTTPProvider, private readonly probeUrl: string) {}
  async measure(signal: AbortSignal): Promise<CaptivePortalResult> {
    const result = await this.provider.request(this.probeUrl, signal);
    const redirected = result.statusCode >= 300 && result.statusCode < 400;
    return { captive: redirected, redirected, statusCode: result.statusCode };
  }
}
