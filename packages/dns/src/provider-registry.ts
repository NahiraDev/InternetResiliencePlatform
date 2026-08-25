import {
  StaticDnsProvider,
  type DnsProvider,
  type DnsResolver,
  type ProviderConfig,
  type ProviderMetadata,
} from './index.js';
import { BUILTIN_PROVIDER_METADATA, PROVIDER_CATALOG } from './provider-catalog.js';

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
  return [...byId.values()];
};

/**
 * Runtime provider factory. Catalog membership is not preference: every
 * candidate is measured by the normal health/benchmark/scoring pipeline.
 */
export const ALL_PROVIDER_METADATA = mergeMetadata();

export const createAllBuiltinProviders = (
  configs: Record<string, Partial<ProviderConfig>> = {},
  resolvers?: DnsResolver[],
): DnsProvider[] =>
  ALL_PROVIDER_METADATA.map(
    (metadata) =>
      new StaticDnsProvider(metadata, { enabled: true, timeoutMs: 2_000, protocols: ['udp', 'tcp', 'doh', 'dot'], ...configs[metadata.id] }, resolvers),
  ).filter((provider) => provider.config.enabled);

export const isIranianProvider = (provider: DnsProvider): boolean =>
  provider.metadata().country?.toUpperCase() === 'IR' ||
  provider.metadata().tags.some((tag) => tag.toLowerCase() === 'iran');

/**
 * Regional reachability is an observation, not a permanent country bonus.
 * A small bounded multiplier is exposed for callers that have a measured
 * regional probe result. A value of 0.5 is neutral; 0 is unreachable and 1
 * is fully reachable. This keeps regional DNS inside normal scoring without
 * allowing geography alone to dominate health/latency.
 */
export const regionalReachabilityMultiplier = (
  provider: DnsProvider,
  measuredReachability: number,
): number => {
  const reachability = Math.max(0, Math.min(1, measuredReachability));
  if (!isIranianProvider(provider)) return 1;
  return 0.9 + reachability * 0.2;
};
