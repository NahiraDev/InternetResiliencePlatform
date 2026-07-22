import type { DNSProvider } from '../providers/DNSProvider.js';
export class DNSMetric { constructor(private readonly provider: DNSProvider, private readonly host: string) {} async measure(signal: AbortSignal): Promise<number | null> { const r=await this.provider.lookup(this.host, signal); return r.addresses.length > 0 ? r.lookupMs : null; } }
