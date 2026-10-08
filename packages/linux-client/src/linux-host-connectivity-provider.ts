/**
 * Real Linux host connectivity provider.
 *
 * Discovers real network interfaces from the host via `ip -j addr show` and
 * converts them into {@link ConnectivityResource}[] for the
 * {@link ConnectivityManager}. This is the production connectivity provider
 * that exposes the host's real network interfaces as canonical connectivity
 * resources — not diagnostics, not simulation.
 *
 * This provider has NO mutation authority. It only observes and reports.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  ConnectivityCapability,
  ConnectivityHealth,
  ConnectivityOperationResult,
  ConnectivityProvider,
  ConnectivityResource,
  ConnectivityState,
} from '@irp/connectivity';

const execFileAsync = promisify(execFile);

export const IP_BINARY = 'ip';
export const DEFAULT_TIMEOUT_MS = 5_000;

interface IpAddrJson {
  readonly ifindex?: number;
  readonly ifname?: string;
  readonly flags?: readonly string[];
  readonly operstate?: string;
  readonly addr_info?: readonly {
    readonly family?: string;
    readonly local?: string;
    readonly prefixlen?: number;
    readonly scope?: string;
  }[];
}

interface IpRouteJson {
  readonly dst?: string;
  readonly gateway?: string;
  readonly dev?: string;
}

function stateFor(operstate: string | undefined): ConnectivityState {
  if (operstate === 'UP') return 'active';
  if (operstate === 'DOWN') return 'disabled';
  if (operstate === 'DORMANT') return 'degraded';
  return operstate ? 'discovered' : 'unknown';
}


/**
 * Real Linux host connectivity provider.
 *
 * Reads `ip -j addr show` and `ip -j route show` to build canonical
 * connectivity resources from the host's actual network interfaces.
 */
export class LinuxHostConnectivityProvider implements ConnectivityProvider {
  readonly id = 'linux-host';
  readonly type = 'ethernet' as const;

  private readonly timeoutMs: number;
  private readonly netns: string | undefined;
  private readonly commandRunner: {
    run(
      binary: string,
      args: readonly string[],
      options: { timeoutMs: number },
    ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  } | undefined;

  constructor(options: {
    readonly netns?: string;
    readonly timeoutMs?: number;
    readonly commandRunner?: {
      run(
        binary: string,
        args: readonly string[],
        options: { timeoutMs: number },
      ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
    };
  } = {}) {
    this.netns = options.netns;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.commandRunner = options.commandRunner;
  }

  private async run(args: readonly string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (this.commandRunner) {
      return this.commandRunner.run(IP_BINARY, args, { timeoutMs: this.timeoutMs });
    }
    try {
      const result = await execFileAsync(IP_BINARY, [...args], {
        timeout: this.timeoutMs,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      });
      return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & {
        stdout?: string;
        stderr?: string;
        code?: number | string;
      };
      return {
        stdout: failure.stdout ?? '',
        stderr: failure.stderr ?? failure.message ?? 'command failed',
        exitCode: typeof failure.code === 'number' ? failure.code : 1,
      };
    }
  }

  async discover(): Promise<ConnectivityResource[]> {
    const addrArgs: string[] = [];
    if (this.netns) addrArgs.push('-n', this.netns);
    addrArgs.push('-j', 'addr', 'show');

    const routeArgs: string[] = [];
    if (this.netns) routeArgs.push('-n', this.netns);
    routeArgs.push('-j', 'route', 'show');

    const [addrResult, routeResult] = await Promise.all([
      this.run(addrArgs),
      this.run(routeArgs),
    ]);

    if (addrResult.exitCode !== 0) return [];

    let interfaces: IpAddrJson[];
    try {
      const parsed = JSON.parse(addrResult.stdout);
      interfaces = Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }

    // Build a gateway map from routes
    const gatewayByDev = new Map<string, string>();
    if (routeResult.exitCode === 0) {
      try {
        const routes = JSON.parse(routeResult.stdout);
        if (Array.isArray(routes)) {
          for (const route of routes as IpRouteJson[]) {
            if (route.gateway && route.dev) {
              gatewayByDev.set(route.dev, route.gateway);
            }
          }
        }
      } catch {
        // Ignore route parsing failure
      }
    }

    const resources: ConnectivityResource[] = [];
    for (const iface of interfaces) {
      if (!iface.ifname) continue;
      // Skip loopback — it's not a connectivity resource
      if (iface.ifname === 'lo') continue;

      const addresses: string[] = [];
      let hasIpv4 = false;
      let hasIpv6 = false;
      const dnsServers: string[] = [];

      for (const addr of iface.addr_info ?? []) {
        if (addr.local) {
          const prefix = addr.prefixlen ?? (addr.family === 'inet6' ? 128 : 32);
          addresses.push(`${addr.local}/${prefix}`);
          if (addr.family === 'inet') hasIpv4 = true;
          if (addr.family === 'inet6') hasIpv6 = true;
        }
      }

      // Skip interfaces with no addresses (not configured)
      if (addresses.length === 0) continue;

      const caps: ConnectivityCapability[] = ['monitor', 'health-check'];
      if (hasIpv4) caps.push('supports-ipv4');
      if (hasIpv6) caps.push('supports-ipv6');
      caps.push('supports-default-route');

      const gateway = gatewayByDev.get(iface.ifname);
      const state = stateFor(iface.operstate);
      const checkedAt = new Date().toISOString();

      resources.push({
        providerId: this.id,
        id: iface.ifname,
        type: this.type,
        ...(iface.ifname ? { interfaceName: iface.ifname } : {}),
        state,
        addresses,
        ...(gateway ? { gateway } : {}),
        dnsServers,
        capabilities: caps,
        health: {
          score: state === 'active' ? 80 : state === 'degraded' ? 40 : 0,
          status: state === 'active' ? 'healthy' : state === 'degraded' ? 'degraded' : 'unhealthy',
          checkedAt,
          source: 'provider',
          factors: {
            operstate: iface.operstate,
            hasIpv4,
            hasIpv6,
          },
        },
        priority: 50,
        metadata: {
          ifindex: iface.ifindex,
          flags: iface.flags,
        },
      });
    }

    return resources;
  }

  async getState(resourceId?: string): Promise<ConnectivityState> {
    const resources = await this.discover();
    const resource = resourceId
      ? resources.find((r) => r.id === resourceId)
      : resources[0];
    return resource?.state ?? 'unknown';
  }

  async getHealth(resourceId?: string): Promise<ConnectivityHealth> {
    const resources = await this.discover();
    const resource = resourceId
      ? resources.find((r) => r.id === resourceId)
      : resources[0];
    return (
      resource?.health ?? {
        score: 0,
        status: 'unhealthy',
        checkedAt: new Date().toISOString(),
        source: 'provider',
      }
    );
  }

  async connect(resourceId: string): Promise<ConnectivityOperationResult> {
    // Host interfaces are always "connected" if they exist and are up
    const state = await this.getState(resourceId);
    return {
      ok: state === 'active' || state === 'degraded',
      resourceId,
      state,
      ...(state === 'unknown'
        ? { error: 'Interface not found' }
        : { metadata: { operation: 'verify-host-interface' } }),
    };
  }

  async disconnect(resourceId: string): Promise<ConnectivityOperationResult> {
    return {
      ok: false,
      resourceId,
      state: 'active',
      error: 'Linux host interface lifecycle is managed by the network manager, not IRP',
    };
  }

  async activate(resourceId: string): Promise<ConnectivityOperationResult> {
    return this.connect(resourceId);
  }

  async deactivate(resourceId: string): Promise<ConnectivityOperationResult> {
    return this.disconnect(resourceId);
  }

  capabilities(): ConnectivityCapability[] {
    return ['monitor', 'health-check', 'supports-ipv4', 'supports-ipv6', 'supports-default-route'];
  }
}
