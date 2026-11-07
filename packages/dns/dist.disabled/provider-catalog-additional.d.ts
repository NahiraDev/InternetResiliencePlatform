import type { ProviderMetadata } from './index.js';
export type AdditionalProviderCatalogEntry = ProviderMetadata & {
    dnssec: boolean;
    region: 'IR';
    discovery: 'verified-public-catalog' | 'community-catalog';
};
/** Iranian resolver families not already represented in the primary catalog. */
export declare const ADDITIONAL_IRANIAN_PROVIDER_METADATA: AdditionalProviderCatalogEntry[];
//# sourceMappingURL=provider-catalog-additional.d.ts.map