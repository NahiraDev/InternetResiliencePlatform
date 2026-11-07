import { NetworkSnapshot, type NetworkType } from '../models/NetworkSnapshot.js';
import { type RetryOptions } from '../utils/Retry.js';
import type { PingProvider } from '../providers/PingProvider.js';
import type { DNSProvider } from '../providers/DNSProvider.js';
import type { HTTPProvider } from '../providers/HTTPProvider.js';
export interface NetworkSamplerOptions {
    pingHost: string;
    dnsHost: string;
    httpUrl: string;
    httpsUrl: string;
    publicIpUrl: string;
    bandwidthUrl: string;
    gatewayHost: string;
    pingAttempts: number;
    timeoutMs: number;
    retry: RetryOptions;
    networkTypeDetector: () => NetworkType;
    now: () => string;
}
export interface NetworkSamplerProviders {
    ping: PingProvider;
    dns: DNSProvider;
    http: HTTPProvider;
}
export declare const DEFAULT_SAMPLER_OPTIONS: NetworkSamplerOptions;
export declare class NetworkSampler {
    private readonly providers;
    private readonly options;
    constructor(providers: NetworkSamplerProviders, options?: NetworkSamplerOptions);
    sample(signal: AbortSignal): Promise<NetworkSnapshot>;
}
//# sourceMappingURL=NetworkSampler.d.ts.map