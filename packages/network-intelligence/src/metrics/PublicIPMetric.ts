import type { HTTPProvider } from '../providers/HTTPProvider.js';
export class PublicIPMetric { constructor(private readonly provider: HTTPProvider, private readonly url: string) {} async measure(signal: AbortSignal): Promise<string | null> { return (await this.provider.publicIp(this.url, signal)).ip; } }
