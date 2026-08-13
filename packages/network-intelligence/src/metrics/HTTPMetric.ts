import type { HTTPProvider } from '../providers/HTTPProvider.js';
export class HTTPMetric {
  constructor(
    private readonly provider: HTTPProvider,
    private readonly url: string,
  ) {}
  async measure(signal: AbortSignal): Promise<number | null> {
    const r = await this.provider.request(this.url, signal);
    return r.statusCode >= 200 && r.statusCode < 500 ? r.responseMs : null;
  }
}
