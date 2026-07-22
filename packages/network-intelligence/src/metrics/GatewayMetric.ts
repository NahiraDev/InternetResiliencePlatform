import type { PingProvider } from '../providers/PingProvider.js';
export class GatewayMetric { constructor(private readonly provider: PingProvider, private readonly gatewayHost: string) {} async measure(signal: AbortSignal): Promise<boolean> { return (await this.provider.ping(this.gatewayHost, signal)).success; } }
