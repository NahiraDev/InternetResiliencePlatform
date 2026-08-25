import {
  BUILTIN_PROVIDER_METADATA,
  StaticDnsProvider,
  type DnsProvider,
  type DnsResolver,
  type ProviderConfig,
  type ProviderMetadata,
} from './index.js';
import { PROVIDER_CATALOG } from './provider-catalog.js';
import { ADDITIONAL_IRANIAN_PROVIDER_METADATA } from './provider-catalog-additional.js';

type CatalogEntry = ProviderMetadata & {
  dnssec: boolean;
  region: 'IR' | 'global';
  discovery: 'curated' | 'verified-public-catalog' | 'community-catalog';
};

const mergeMetadata = (): Array<ProviderMetadata & { dnssec: boolean }> => {
  const byId = new Map<string, ProviderMetadata & { dnssec: boolean }>();
  for (const entry of BUILTIN_PROVIDER_METADATA) byId.set(entry.id, entry);
  for (const entry of PROVIDER_CATALOG as CatalogEntry[]) {
    if (!byId.has(entry.id)) byId.set(entry.id, entry);
  }
  for (const entry of ADDITIONAL_IRANIAN_PROVIDER_METADATA) {
    if (!byId.has(entry.id)) byId.set(entry.id, entry);
  }
  return [...byId.values()];
};

/** Runtime provider factory. Catalog membership is never preference. */
export const ALL_PROVIDER_METADATA = mergeMetadata();

export const IRANIAN_PROVIDER_METADATA = ALL_PROVIDER_METADATA.filter(
  (entry) => entry.country?.toUpperCase() === 'IR',
);

export const GLOBAL_PROVIDER_METADATA = ALL_PROVIDER_METADATA.filter(
  (entry) => entry.country?.toUpperCase() !== 'IR',
);

export const createAllBuiltinProviders = (
  configs: Record<string, Partial<ProviderConfig>> = {},
  resolvers?: DnsResolver[],
): DnsProvider[] =>
  ALL_PROVIDER_METADATA.map(
    (metadata) =>
      new StaticDnsProvider(
        metadata,
        {
          enabled: true,
          timeoutMs: 2_000,
          protocols: ['udp', 'tcp', 'doh', 'dot'],
          ...configs[metadata.id],
        },
        resolvers,
      ),
  ).filter((provider) => provider.config.enabled);

export const isIranianProvider = (provider: DnsProvider): boolean =>
  provider.metadata().country?.toUpperCase() === 'IR' ||
  provider.metadata().tags.some((tag) => tag.toLowerCase() === 'iran');

/** Regional reachability is a measured factor, not a static country bonus. */
export const regionalReachabilityMultiplier = (
  provider: DnsProvider,
  measuredReachability: number,
): number => {
  const reachability = Math.max(0, Math.min(1, measuredReachability));
  if (!isIranianProvider(provider)) return 1;
  return 0.9 + reachability * 0.2;
};
