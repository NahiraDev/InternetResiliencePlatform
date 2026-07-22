import type { PingProvider } from '../providers/PingProvider.js';
export class LatencyMetric { constructor(private readonly provider: PingProvider, private readonly host: string) {} async measure(signal: AbortSignal): Promise<number | null> { const r=await this.provider.ping(this.host, signal); return r.success ? r.latencyMs : null; } }
