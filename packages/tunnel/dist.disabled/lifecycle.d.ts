import { type KillSwitch, type PlatformTunnelAdapter, type Tunnel, type TunnelConnection, type TunnelConfiguration, type TunnelEventBus, type TunnelHealth, type TunnelMetrics, type TunnelProviderRegistry } from './index.js';
export interface TunnelLifecycleOptions {
    maxConnectAttempts?: number;
    connectTimeoutMs?: number;
    disconnectTimeoutMs?: number;
    healthTimeoutMs?: number;
    requireHealth?: boolean;
    requireRouteValidation?: boolean;
    killSwitchRequired?: boolean;
}
export interface TunnelLifecycleResult {
    tunnel: Tunnel;
    connection: TunnelConnection;
    health: TunnelHealth;
    attempts: number;
}
export declare class AutomatedTunnelLifecycle {
    private readonly registry;
    private readonly adapter;
    private readonly killSwitch?;
    private readonly events?;
    private readonly metrics?;
    private readonly options;
    private readonly locks;
    private readonly connections;
    private readonly tunnels;
    constructor(registry: TunnelProviderRegistry, adapter: PlatformTunnelAdapter, killSwitch?: KillSwitch | undefined, events?: TunnelEventBus | undefined, metrics?: TunnelMetrics | undefined, options?: TunnelLifecycleOptions);
    getTunnel(tunnelId: string): Tunnel | undefined;
    getConnection(tunnelId: string): TunnelConnection | undefined;
    establish(providerId: string, config: TunnelConfiguration): Promise<TunnelLifecycleResult>;
    connect(tunnelId: string): Promise<TunnelLifecycleResult>;
    disconnect(tunnelId: string, destroy?: boolean): Promise<void>;
    reconnect(tunnelId: string): Promise<TunnelLifecycleResult>;
    rotate(tunnelId: string, changes?: Pick<Partial<TunnelConfiguration>, 'credentialRef' | 'authentication' | 'endpoint'>): Promise<TunnelLifecycleResult>;
    shutdown(): Promise<void>;
    private requiresKillSwitch;
    private assertProviderCompatibility;
    private prepareRetry;
    private rollbackCreatedTunnel;
    private markFailed;
    private toDisconnecting;
    private requireTunnel;
    private requireProvider;
    private lock;
    private unlock;
    private emit;
}
//# sourceMappingURL=lifecycle.d.ts.map