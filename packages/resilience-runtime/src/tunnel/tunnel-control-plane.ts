import type { TunnelConfiguration, TunnelProvider, TunnelProviderRegistry } from '@irp/tunnel';
import { TunnelManager, NftablesKillSwitch, type KillSwitch } from '@irp/tunnel';
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

export class TunnelRegistryControlPlane implements CanonicalTunnelControlPlane {
  private readonly manager: TunnelManager;
  private readonly providerId: string | undefined;
  private readonly configuration: TunnelConfiguration | undefined;
  private readonly provider: TunnelProvider | undefined;
  private readonly enabled: boolean;
  private managedTunnelId: string | undefined;
  private activeTunnelId: string | undefined;
  readonly killSwitch: KillSwitch;

  constructor(
    private readonly registry: TunnelProviderRegistry,
    options: TunnelRegistryControlPlaneOptions = {},
  ) {
    this.enabled = options.enabled === true;
    this.providerId = options.providerId;
    this.configuration = options.configuration;
    this.manager = new TunnelManager(registry, undefined, undefined, {
      maxTunnels: options.maxTunnels ?? 2,
      maxConcurrentConnects: 1,
    });
    this.provider = this.providerId ? this.registry.get(this.providerId) : undefined;
    const killSwitchOptions: { tunnelInterface?: string; allowedUdpPorts?: number[] } = {};
    if (options.killSwitchOptions?.tunnelInterface !== undefined) {
      killSwitchOptions.tunnelInterface = options.killSwitchOptions.tunnelInterface;
    }
    if (options.killSwitchOptions?.allowedUdpPorts !== undefined) {
      killSwitchOptions.allowedUdpPorts = options.killSwitchOptions.allowedUdpPorts;
    }
    this.killSwitch = new NftablesKillSwitch(killSwitchOptions);
  }

  getKillSwitch(): KillSwitch {
    return this.killSwitch;
  }

  get configured(): boolean {
    return this.enabled && this.provider !== undefined && this.configuration !== undefined;
  }

  get activeTunnel(): string | undefined {
    return this.activeTunnelId;
  }

  get managedTunnel(): string | undefined {
    return this.managedTunnelId;
  }

  async connect(request?: {
    providerId?: string;
    configuration?: TunnelConfiguration;
  }): Promise<{
    tunnelId: string;
    providerId: string;
    connectionId: string;
  }> {
    if (!this.configured) throw new Error('Tunnel control plane is not configured');
    const providerId = request?.providerId ?? this.providerId!;
    if (providerId !== this.providerId) throw new Error('Requested tunnel provider is not authorized by this control plane');
    if (this.managedTunnelId !== undefined) {
      throw new Error('A tunnel is already managed by this control plane; use reconnect instead');
    }
    const configuration = request?.configuration ?? this.configuration!;
    const tunnel = await this.manager.configure(providerId, configuration);
    this.managedTunnelId = tunnel.id;
    try {
      const connection = await this.manager.connect(tunnel.id);
      this.activeTunnelId = tunnel.id;
      return { tunnelId: tunnel.id, providerId, connectionId: connection.id };
    } catch (error) {
      this.activeTunnelId = undefined;
      throw error;
    }
  }

  async reconnect(request?: { providerId?: string; tunnelId?: string }): Promise<{
    tunnelId: string;
    providerId: string;
    connectionId: string;
  }> {
    if (!this.configured) throw new Error('Tunnel control plane is not configured');
    const providerId = request?.providerId ?? this.providerId!;
    if (providerId !== this.providerId) throw new Error('Requested tunnel provider is not authorized by this control plane');
    const tunnelId = this.managedTunnelId;
    if (tunnelId === undefined) throw new Error('No managed tunnel is available for reconnect');
    if (request?.tunnelId !== undefined && request.tunnelId !== tunnelId) {
      throw new Error('Reconnect request does not match the managed tunnel');
    }
    this.activeTunnelId = undefined;
    const connection = await this.manager.reconnectTunnel(tunnelId);
    this.activeTunnelId = tunnelId;
    return { tunnelId, providerId, connectionId: connection.id };
  }

  async verify(tunnelId: string): Promise<boolean> {
    if (!this.configured || this.provider === undefined || tunnelId !== this.managedTunnelId) return false;
    const tunnel = this.manager.getTunnel(tunnelId);
    if (!tunnel) return false;
    try {
      const health = await this.provider.healthCheck(tunnel);
      return health.status === 'healthy';
    } catch {
      return false;
    }
  }

  async rollback(): Promise<boolean> {
    const tunnelId = this.managedTunnelId;
    if (tunnelId === undefined) return true;
    try {
      await this.manager.disconnectTunnel(tunnelId);
      this.activeTunnelId = undefined;
      this.managedTunnelId = undefined;
      return true;
    } catch {
      return false;
    }
  }
}
