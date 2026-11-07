import { BUILTIN_PROVIDER_METADATA, StaticDnsProvider, } from './index.js';
import { PROVIDER_CATALOG } from './provider-catalog.js';
import { ADDITIONAL_IRANIAN_PROVIDER_METADATA } from './provider-catalog-additional.js';
const mergeMetadata = () => {
    const byId = new Map();
    for (const entry of BUILTIN_PROVIDER_METADATA)
        byId.set(entry.id, entry);
    for (const entry of PROVIDER_CATALOG) {
        if (!byId.has(entry.id))
            byId.set(entry.id, entry);
    }
    for (const entry of ADDITIONAL_IRANIAN_PROVIDER_METADATA) {
        if (!byId.has(entry.id))
            byId.set(entry.id, entry);
    }
    return [...byId.values()];
};
/** Runtime provider factory. Catalog membership is never preference. */
export const ALL_PROVIDER_METADATA = mergeMetadata();
export const IRANIAN_PROVIDER_METADATA = ALL_PROVIDER_METADATA.filter((entry) => entry.country?.toUpperCase() === 'IR');
export const GLOBAL_PROVIDER_METADATA = ALL_PROVIDER_METADATA.filter((entry) => entry.country?.toUpperCase() !== 'IR');
export const createAllBuiltinProviders = (configs = {}, resolvers) => ALL_PROVIDER_METADATA.map((metadata) => new StaticDnsProvider(metadata, {
    enabled: true,
    timeoutMs: 2_000,
    protocols: ['udp', 'tcp', 'doh', 'dot'],
    ...configs[metadata.id],
}, resolvers)).filter((provider) => provider.config.enabled);
export const isIranianProvider = (provider) => provider.metadata().country?.toUpperCase() === 'IR' ||
    provider.metadata().tags.some((tag) => tag.toLowerCase() === 'iran');
/** Regional reachability is a measured factor, not a static country bonus. */
export const regionalReachabilityMultiplier = (provider, measuredReachability) => {
    const reachability = Math.max(0, Math.min(1, measuredReachability));
    if (!isIranianProvider(provider))
        return 1;
    return 0.9 + reachability * 0.2;
};
//# sourceMappingURL=provider-registry.js.map