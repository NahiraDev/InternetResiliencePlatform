/**
 * Real Linux route discovery and verification provider.
 *
 * Reads actual `ip -j route show` output and converts it into
 * {@link DiscoveredRoute}[] for the {@link RoutingEngine}. Also implements
 * the `verify` contract so the routing engine can confirm an applied plan
 * took effect by observing the resulting route state.
 *
 * This provider has NO mutation authority. It only observes.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  type DiscoveredRoute,
  type RouteDiscoveryProvider,
  type RoutePlan,
  type RoutingDecisionContext,
  type RouteProtocol,
  type RouteScope,
  type RouteState,
} from '@irp/routing';

const execFileAsync = promisify(execFile);

export const IP_BINARY = 'ip';
export const DEFAULT_TIMEOUT_MS = 5_000;

interface IpRouteJson {
  readonly dst?: string;
  readonly gateway?: string;
  readonly dev?: string;
  readonly src?: string;
  readonly protocol?: string;
  readonly metric?: number;
  readonly scope?: string;
  readonly table?: string;
  readonly flags?: readonly unknown[];
}

function inferFamily(dst: string): 'ipv4' | 'ipv6' {
  return dst.includes(':') ? 'ipv6' : 'ipv4';
}

function protocolFor(raw: string | undefined): RouteProtocol {
  switch (raw) {
    case 'kernel':
      return 'kernel';
    case 'static':
      return 'static';
    case 'dhcp':
    case 'ra':
      return 'provider';
    default:
      return raw ? 'provider' : 'kernel';
  }
}

function scopeFor(raw: string | undefined): RouteScope {
  switch (raw) {
    case 'link':
      return 'link';
    case 'host':
      return 'host';
    case 'site':
      return 'site';
    default:
      return raw ? 'custom' : 'global';
  }
}

function stateFor(_raw: IpRouteJson): RouteState {
  // `ip route show` only lists active routes; absence of error means active.
  return 'active';
}

/**
 * Converts a single `ip -j route show` JSON entry into a
 * {@link DiscoveredRoute}.
 */
export function ipRouteToDiscovered(raw: IpRouteJson): DiscoveredRoute {
  const dst = raw.dst ?? 'default';
  const [base, prefixStr] = dst.includes('/') ? dst.split('/') : [dst, undefined];
  const family = inferFamily(dst);
  const prefix =
    prefixStr !== undefined
      ? Number(prefixStr)
      : dst === 'default'
        ? 0
        : family === 'ipv4'
          ? 32
          : 128;

  const table = raw.table ?? 'main';

  return {
    destination: base ?? dst,
    prefix,
    ...(raw.gateway ? { gateway: raw.gateway } : {}),
    ...(raw.dev ? { interfaceName: raw.dev } : {}),
    ...(raw.src ? { source: raw.src } : {}),
    protocol: protocolFor(raw.protocol),
    metric: raw.metric ?? 0,
    table: { id: table, kind: table === 'main' ? 'main' : 'custom', name: table },
    family,
    scope: scopeFor(raw.scope),
    state: stateFor(raw),
    priority: 0,
    capabilities: [family],
    metadata: {
      pathType: 'direct',
      rawTable: table,
      ...(raw.flags ? { flags: raw.flags } : {}),
    },
  };
}

/**
 * Real Linux route discovery provider.
 *
 * Reads `ip -j route show` (all tables) and converts the output into
 * {@link DiscoveredRoute}[] for the routing engine.
 */
export class LinuxRouteDiscoveryProvider implements RouteDiscoveryProvider {
  readonly id = 'linux-route-discovery';

  constructor(
    private readonly options: {
      readonly netns?: string;
      readonly timeoutMs?: number;
      readonly commandRunner?: {
        run(
          binary: string,
          args: readonly string[],
          options: { timeoutMs: number },
        ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
      };
    } = {},
  ) {}

  private async run(args: readonly string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const runner = this.options.commandRunner;
    if (runner) {
      return runner.run(IP_BINARY, args, {
        timeoutMs: this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });
    }
    try {
      const result = await execFileAsync(IP_BINARY, [...args], {
        timeout: this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
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

  async discoverRoutes(_context: RoutingDecisionContext): Promise<DiscoveredRoute[]> {
    const args: string[] = [];
    if (this.options.netns) args.push('-n', this.options.netns);
    args.push('-j', 'route', 'show');

    const result = await this.run(args);
    if (result.exitCode !== 0) {
      return [];
    }

    try {
      const parsed = JSON.parse(result.stdout);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((entry) => ipRouteToDiscovered(entry as IpRouteJson));
    } catch {
      return [];
    }
  }

  /** Routes currently installed for the plan's target, or undefined if they cannot be read. */
  private async installedRoutes(plan: RoutePlan): Promise<readonly Record<string, unknown>[] | undefined> {
    const dest = plan.destination;
    const selected = plan.selectedPath;
    if (!selected) return undefined;

    const family = dest.family === 'ipv6' ? 'ipv6' : 'ipv4';
    const target =
      dest.kind === 'default'
        ? 'default'
        : dest.kind === 'cidr'
          ? dest.value
          : dest.kind === 'ip'
            ? `${dest.value}/${family === 'ipv6' ? 128 : 32}`
            : undefined;

    if (!target) return undefined;

    const table = selected.route.table.name || 'main';
    const args: string[] = [];
    if (this.options.netns) args.push('-n', this.options.netns);
    // iproute2 accepts `inet`/`inet6` for `-f`; the symbolic `ipv4`/`ipv6` are rejected with
    // "invalid protocol family", which made every verification fail against a real kernel and
    // every live route change roll itself back.
    args.push('-j', '-f', family === 'ipv6' ? 'inet6' : 'inet', 'route', 'show', 'table', table, target);

    const result = await this.run(args);
    if (result.exitCode !== 0) return undefined;

    try {
      const parsed = JSON.parse(result.stdout);
      return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Verifies that an applied route plan's target route exists in the kernel
   * routing table.
   */
  async verify(plan: RoutePlan): Promise<boolean> {
    const routes = await this.installedRoutes(plan);
    const expected = plan.selectedPath?.route;
    if (routes === undefined || routes.length === 0 || !expected) return false;

    // Presence alone is not enough: a pre-existing route through another
    // interface/gateway must not verify a candidate that was meant to use the
    // selected tunnel or uplink. Check every path attribute the plan specified.
    return routes.some((route) => {
      if (expected.interfaceName !== undefined && route['dev'] !== expected.interfaceName) {
        return false;
      }
      if (expected.gateway !== undefined && route['gateway'] !== expected.gateway) {
        return false;
      }
      if (
        expected.gateway === undefined &&
        expected.interfaceName !== undefined &&
        typeof route['gateway'] === 'string'
      ) {
        return false;
      }
      return true;
    });
  }

  /**
   * Verifies a rollback from kernel state: no route to the plan's target still goes through the
   * selected path's gateway and device. A route the rollback restored (a different gateway or
   * device) does not count against it. An unreadable table is "unproven", never "rolled back".
   */
  async verifyRolledBack(plan: RoutePlan): Promise<boolean> {
    const wanted = plan.selectedPath?.route;
    if (!wanted) return false;
    const routes = await this.installedRoutes(plan);
    if (routes === undefined) return false;
    return !routes.some(
      (entry) =>
        (wanted.gateway === undefined || entry['gateway'] === wanted.gateway) &&
        (wanted.interfaceName === undefined || entry['dev'] === wanted.interfaceName),
    );
  }
}
