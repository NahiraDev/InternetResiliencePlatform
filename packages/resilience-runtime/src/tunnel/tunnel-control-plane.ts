import type {
  TunnelConfiguration,
  TunnelProvider,
  TunnelProviderRegistry,
} from '@irp/tunnel';
import { TunnelManager } from '@irp/tunnel';
import type { CanonicalTunnelControlPlane } from '../canonical-network-adapter.js';

export interface TunnelRegistryControlPlaneOptions {
  enabled?: boolean;
  providerId?: string;
  configuration?: TunnelConfiguration;
  maxTunnels?: number;
}

export class TunnelRegistryControlPlane implements CanonicalTunnelControlPlane {
  private readonly manager: TunnelManager;
  private readonly providerId: string | undefined;
  private readonly configuration: TunnelConfiguration | undefined;
  private readonly provider: TunnelProvider | undefined;
  private readonly enabled: boolean;
  private activeTunnelId: string | undefined;

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
  }

  get configured(): boolean {
    return this.enabled && this.provider !== undefined && this.configuration !== undefined;
  }

  get activeTunnel(): string | undefined {
    return this.activeTunnelId;
  }

  async connect(request?: { providerId?: string }): Promise<{
    tunnelId: string;
    providerId: string;
    connectionId: string;
  }> {
    if (!this.configured) throw new Error('Tunnel control plane is not configured');
    const providerId = request?.providerId ?? this.providerId!;
    const configuration = this.configuration!;
    const tunnel = await this.manager.configure(providerId, configuration);
    const connection = await this.manager.connect(tunnel.id);
    this.activeTunnelId = tunnel.id;
    return { tunnelId: tunnel.id, providerId, connectionId: connection.id };
  }

  async verify(tunnelId: string): Promise<boolean> {
    if (!this.configured || this.provider === undefined) return false;
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
    if (this.activeTunnelId === undefined) return true;
    try {
      await this.manager.disconnectTunnel(this.activeTunnelId);
      this.activeTunnelId = undefined;
      return true;
    } catch {
      return false;
    }
  }
}