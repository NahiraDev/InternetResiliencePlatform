import type { TunnelConfiguration, TunnelProviderRegistry } from '@irp/tunnel';
import { type KillSwitch } from '@irp/tunnel';
import type { CanonicalTunnelControlPlane } from '../canonical-network-adapter.js';
export interface TunnelRegistryControlPlaneOptions {
    enabled?: boolean;
    providerId?: string;
    configuration?: TunnelConfiguration;
    maxTunnels?: number;
    killSwitchOptions?: {
        tunnelInterface?: string;
        allowedUdpPorts?: number[];
    };
}
export declare class TunnelRegistryControlPlane implements CanonicalTunnelControlPlane {
    private readonly registry;
    private readonly manager;
    private readonly providerId;
    private readonly configuration;
    private readonly provider;
    private readonly enabled;
    private managedTunnelId;
    private activeTunnelId;
    readonly killSwitch: KillSwitch;
    constructor(registry: TunnelProviderRegistry, options?: TunnelRegistryControlPlaneOptions);
    getKillSwitch(): KillSwitch;
    get configured(): boolean;
    get activeTunnel(): string | undefined;
    get managedTunnel(): string | undefined;
    connect(request?: {
        providerId?: string;
        configuration?: TunnelConfiguration;
    }): Promise<{
        tunnelId: string;
        providerId: string;
        connectionId: string;
    }>;
    reconnect(request?: {
        providerId?: string;
        tunnelId?: string;
    }): Promise<{
        tunnelId: string;
        providerId: string;
        connectionId: string;
    }>;
    verify(tunnelId: string): Promise<boolean>;
    rollback(): Promise<boolean>;
}
//# sourceMappingURL=tunnel-control-plane.d.ts.map