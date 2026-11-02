/**
 * Advertises configured WireGuard AllowedIPs as route candidates only while the
 * canonical tunnel control plane reports an active, healthy peer handshake.
 *
 * This provider has no mutation authority. The canonical RoutingEngine chooses
 * a route and the LinuxRouteExecutor applies it through the privileged mutation
 * boundary; LinuxRouteDiscoveryProvider then proves the selected device route
 * exists in the kernel.
 */
import { isIP } from 'node:net';
import type { DiscoveredRoute, RouteDiscoveryProvider, RoutingDecisionContext } from '@irp/routing';
import type { CanonicalTunnelControlPlane } from '@irp/resilience-runtime';

export interface LinuxWireGuardRouteDiscoveryOptions {
  readonly controlPlane: Pick<CanonicalTunnelControlPlane, 'activeTunnel' | 'verify'>;
  readonly interfaceName: string;
  readonly allowedIPs: readonly string[];
  readonly failureDomain?: string;
}

type IpFamily = 'ipv4' | 'ipv6';

function parseAllowedIp(value: string): { address: string; prefix: number; family: IpFamily } {
  const parts = value.split('/');
  if (parts.length !== 2 || !parts[0] || !/^\d+$/.test(parts[1] ?? '')) {
    throw new Error(`Invalid WireGuard AllowedIP CIDR: ${value}`);
  }
  const version = isIP(parts[0]);
  const prefix = Number(parts[1]);
  const maximum = version === 4 ? 32 : version === 6 ? 128 : -1;
  if (maximum < 0 || !Number.isInteger(prefix) || prefix < 0 || prefix > maximum) {
    throw new Error(`Invalid WireGuard AllowedIP CIDR: ${value}`);
  }
  return { address: parts[0], prefix, family: version === 4 ? 'ipv4' : 'ipv6' };
}

export class LinuxWireGuardRouteDiscoveryProvider implements RouteDiscoveryProvider {
  readonly id = 'linux-wireguard-route-discovery';
  private readonly allowedIPs: readonly {
    readonly value: string;
    readonly address: string;
    readonly prefix: number;
    readonly family: IpFamily;
  }[];

  constructor(private readonly options: LinuxWireGuardRouteDiscoveryOptions) {
    if (!/^[A-Za-z0-9_.-]{1,15}$/.test(options.interfaceName)) {
      throw new Error('WireGuard route interface name is invalid');
    }
    if (options.allowedIPs.length === 0 || options.allowedIPs.length > 64) {
      throw new Error('WireGuard route discovery requires between 1 and 64 AllowedIPs');
    }
    if (new Set(options.allowedIPs).size !== options.allowedIPs.length) {
      throw new Error('WireGuard route discovery AllowedIPs must be unique');
    }
    this.allowedIPs = options.allowedIPs.map((value) => ({
      value,
      ...parseAllowedIp(value),
    }));
    if (this.allowedIPs.some(({ prefix, family }) =>
      prefix === 0 && (family === 'ipv4' || family === 'ipv6'))) {
      throw new Error('WireGuard default routes require the separate full-tunnel egress integration');
    }
  }

  async discoverRoutes(_context: RoutingDecisionContext): Promise<DiscoveredRoute[]> {
    const tunnelId = this.options.controlPlane.activeTunnel;
    if (!tunnelId) return [];

    let healthy = false;
    try {
      healthy = await this.options.controlPlane.verify(tunnelId);
    } catch {
      healthy = false;
    }
    if (!healthy) return [];

    const checkedAt = new Date().toISOString();
    const failureDomain = this.options.failureDomain ?? `wireguard:${this.options.interfaceName}`;
    return this.allowedIPs.map(({ value, address, prefix, family }, index) => ({
      id: `wireguard:${this.options.interfaceName}:${index}`,
      destination: address,
      prefix,
      interfaceName: this.options.interfaceName,
      protocol: 'static',
      metric: 5,
      table: { id: 'main', kind: 'main', name: 'main' },
      family,
      scope: 'global',
      state: 'active',
      priority: 100,
      capabilities: [family],
      health: {
        score: 95,
        status: 'healthy',
        checkedAt,
      },
      metadata: {
        pathType: 'vpn',
        provider: 'wireguard',
        tunnelId,
        allowedIP: value,
        failureDomains: [failureDomain],
        routeManagedBy: 'canonical-routing',
      },
    }));
  }
}
