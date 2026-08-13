import type { HTTPProvider } from '../providers/HTTPProvider.js';
export class BandwidthMetric {
  constructor(
    private readonly provider: HTTPProvider,
    private readonly url: string,
  ) {}
  async measure(signal: AbortSignal): Promise<number | null> {
    return (await this.provider.bandwidth(this.url, signal)).mbps;
  }
}
