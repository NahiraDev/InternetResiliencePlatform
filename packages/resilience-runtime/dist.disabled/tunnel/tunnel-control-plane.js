import { TunnelManager, NftablesKillSwitch } from '@irp/tunnel';
export class TunnelRegistryControlPlane {
    registry;
    manager;
    providerId;
    configuration;
    provider;
    enabled;
    managedTunnelId;
    activeTunnelId;
    killSwitch;
    constructor(registry, options = {}) {
        this.registry = registry;
        this.enabled = options.enabled === true;
        this.providerId = options.providerId;
        this.configuration = options.configuration;
        this.manager = new TunnelManager(registry, undefined, undefined, {
            maxTunnels: options.maxTunnels ?? 2,
            maxConcurrentConnects: 1,
        });
        this.provider = this.providerId ? this.registry.get(this.providerId) : undefined;
        const killSwitchOptions = {};
        if (options.killSwitchOptions?.tunnelInterface !== undefined) {
            killSwitchOptions.tunnelInterface = options.killSwitchOptions.tunnelInterface;
        }
        if (options.killSwitchOptions?.allowedUdpPorts !== undefined) {
            killSwitchOptions.allowedUdpPorts = options.killSwitchOptions.allowedUdpPorts;
        }
        this.killSwitch = new NftablesKillSwitch(killSwitchOptions);
    }
    getKillSwitch() {
        return this.killSwitch;
    }
    get configured() {
        return this.enabled && this.provider !== undefined && this.configuration !== undefined;
    }
    get activeTunnel() {
        return this.activeTunnelId;
    }
    get managedTunnel() {
        return this.managedTunnelId;
    }
    async connect(request) {
        if (!this.configured)
            throw new Error('Tunnel control plane is not configured');
        const providerId = request?.providerId ?? this.providerId;
        if (providerId !== this.providerId)
            throw new Error('Requested tunnel provider is not authorized by this control plane');
        if (this.managedTunnelId !== undefined) {
            throw new Error('A tunnel is already managed by this control plane; use reconnect instead');
        }
        const configuration = request?.configuration ?? this.configuration;
        const tunnel = await this.manager.configure(providerId, configuration);
        this.managedTunnelId = tunnel.id;
        try {
            const connection = await this.manager.connect(tunnel.id);
            this.activeTunnelId = tunnel.id;
            return { tunnelId: tunnel.id, providerId, connectionId: connection.id };
        }
        catch (error) {
            this.activeTunnelId = undefined;
            throw error;
        }
    }
    async reconnect(request) {
        if (!this.configured)
            throw new Error('Tunnel control plane is not configured');
        const providerId = request?.providerId ?? this.providerId;
        if (providerId !== this.providerId)
            throw new Error('Requested tunnel provider is not authorized by this control plane');
        const tunnelId = this.managedTunnelId;
        if (tunnelId === undefined)
            throw new Error('No managed tunnel is available for reconnect');
        if (request?.tunnelId !== undefined && request.tunnelId !== tunnelId) {
            throw new Error('Reconnect request does not match the managed tunnel');
        }
        this.activeTunnelId = undefined;
        const connection = await this.manager.reconnectTunnel(tunnelId);
        this.activeTunnelId = tunnelId;
        return { tunnelId, providerId, connectionId: connection.id };
    }
    async verify(tunnelId) {
        if (!this.configured || this.provider === undefined || tunnelId !== this.managedTunnelId)
            return false;
        const tunnel = this.manager.getTunnel(tunnelId);
        if (!tunnel)
            return false;
        try {
            const health = await this.provider.healthCheck(tunnel);
            return health.status === 'healthy';
        }
        catch {
            return false;
        }
    }
    async rollback() {
        const tunnelId = this.managedTunnelId;
        if (tunnelId === undefined)
            return true;
        try {
            await this.manager.disconnectTunnel(tunnelId);
            this.activeTunnelId = undefined;
            this.managedTunnelId = undefined;
            return true;
        }
        catch {
            return false;
        }
    }
}
//# sourceMappingURL=tunnel-control-plane.js.map