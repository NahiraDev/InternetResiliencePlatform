import type { HTTPProvider } from '../providers/HTTPProvider.js';
export class TLSMetric { constructor(private readonly provider: HTTPProvider, private readonly url: string) {} async measure(signal: AbortSignal): Promise<number | null> { const r=await this.provider.tlsHandshake(this.url, signal); return r.authorized ? r.handshakeMs : null; } }
