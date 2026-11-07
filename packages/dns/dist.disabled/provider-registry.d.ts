import { type DnsProvider, type DnsResolver, type ProviderConfig, type ProviderMetadata } from './index.js';
/** Runtime provider factory. Catalog membership is never preference. */
export declare const ALL_PROVIDER_METADATA: (ProviderMetadata & {
    dnssec: boolean;
})[];
export declare const IRANIAN_PROVIDER_METADATA: (ProviderMetadata & {
    dnssec: boolean;
})[];
export declare const GLOBAL_PROVIDER_METADATA: (ProviderMetadata & {
    dnssec: boolean;
})[];
export declare const createAllBuiltinProviders: (configs?: Record<string, Partial<ProviderConfig>>, resolvers?: DnsResolver[]) => DnsProvider[];
export declare const isIranianProvider: (provider: DnsProvider) => boolean;
/** Regional reachability is a measured factor, not a static country bonus. */
export declare const regionalReachabilityMultiplier: (provider: DnsProvider, measuredReachability: number) => number;
//# sourceMappingURL=provider-registry.d.ts.map