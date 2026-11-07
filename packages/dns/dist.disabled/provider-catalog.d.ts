import type { ProviderMetadata } from './index.js';
export type BuiltinProviderCatalogEntry = ProviderMetadata & {
    dnssec: boolean;
    region: 'IR' | 'global';
    discovery: 'curated' | 'verified-public-catalog' | 'community-catalog';
};
/**
 * Extended resolver catalog.
 *
 * Catalog membership is identity/discovery metadata only. It MUST NOT imply
 * preference or reachability. Runtime probing, protocol validation, historical
 * health and regional measurements remain authoritative for selection.
 *
 * Iranian entries are sourced from multiple public resolver catalogs and are
 * intentionally kept separate from the global curated set so the registry can
 * distinguish regional candidates without assigning them an artificial score.
 */
export declare const EXTENDED_PROVIDER_METADATA: BuiltinProviderCatalogEntry[];
export declare const IRANIAN_PROVIDER_METADATA: BuiltinProviderCatalogEntry[];
export declare const GLOBAL_PROVIDER_METADATA: BuiltinProviderCatalogEntry[];
export declare const PROVIDER_CATALOG: BuiltinProviderCatalogEntry[];
//# sourceMappingURL=provider-catalog.d.ts.map