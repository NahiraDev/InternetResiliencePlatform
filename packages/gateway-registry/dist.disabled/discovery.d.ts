import type { GatewayMetadata, GatewayRegistry } from './index.js';
export interface GatewayDiscoverySource {
    discover(): Promise<GatewayMetadata[]>;
}
export interface GatewayDiscoveryOptions {
    staleAfterMs: number;
    now?: () => number;
}
export interface GatewayDiscoveryResult {
    discovered: number;
    registered: number;
    updated: number;
    stale: number;
    rejected: number;
    errors: Array<{
        gatewayId?: string;
        reason: string;
    }>;
}
export declare class GatewayDiscovery {
    private readonly registry;
    private readonly options;
    constructor(registry: GatewayRegistry, options: GatewayDiscoveryOptions);
    refresh(source: GatewayDiscoverySource): Promise<GatewayDiscoveryResult>;
}
//# sourceMappingURL=discovery.d.ts.map