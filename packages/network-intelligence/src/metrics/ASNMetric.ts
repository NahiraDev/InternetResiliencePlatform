import type { HTTPProvider } from '../providers/HTTPProvider.js';
export class ASNMetric {
  constructor(
    private readonly provider: HTTPProvider,
    private readonly url: string,
  ) {}
  async measure(signal: AbortSignal): Promise<number | null> {
    return (await this.provider.publicIp(this.url, signal)).asn;
  }
}
