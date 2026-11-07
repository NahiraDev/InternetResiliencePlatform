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
const execFileAsync = promisify(execFile);
export const IP_BINARY = 'ip';
export const DEFAULT_TIMEOUT_MS = 5_000;
function stateFor(operstate) {
    if (operstate === 'UP')
        return 'active';
    if (operstate === 'DOWN')
        return 'disabled';
    if (operstate === 'DORMANT')
        return 'degraded';
    return operstate ? 'discovered' : 'unknown';
}
/**
 * Real Linux host connectivity provider.
 *
 * Reads `ip -j addr show` and `ip -j route show` to build canonical
 * connectivity resources from the host's actual network interfaces.
 */
export class LinuxHostConnectivityProvider {
    id = 'linux-host';
    type = 'ethernet';
    timeoutMs;
    netns;
    commandRunner;
    constructor(options = {}) {
        this.netns = options.netns;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.commandRunner = options.commandRunner;
    }
    async run(args) {
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
        }
        catch (error) {
            const failure = error;
            return {
                stdout: failure.stdout ?? '',
                stderr: failure.stderr ?? failure.message ?? 'command failed',
                exitCode: typeof failure.code === 'number' ? failure.code : 1,
            };
        }
    }
    async discover() {
        const addrArgs = [];
        if (this.netns)
            addrArgs.push('-n', this.netns);
        addrArgs.push('-j', 'addr', 'show');
        const routeArgs = [];
        if (this.netns)
            routeArgs.push('-n', this.netns);
        routeArgs.push('-j', 'route', 'show');
        const [addrResult, routeResult] = await Promise.all([
            this.run(addrArgs),
            this.run(routeArgs),
        ]);
        if (addrResult.exitCode !== 0)
            return [];
        let interfaces;
        try {
            const parsed = JSON.parse(addrResult.stdout);
            interfaces = Array.isArray(parsed) ? parsed : [];
        }
        catch {
            return [];
        }
        // Build a gateway map from routes
        const gatewayByDev = new Map();
        if (routeResult.exitCode === 0) {
            try {
                const routes = JSON.parse(routeResult.stdout);
                if (Array.isArray(routes)) {
                    for (const route of routes) {
                        if (route.gateway && route.dev) {
                            gatewayByDev.set(route.dev, route.gateway);
                        }
                    }
                }
            }
            catch {
                // Ignore route parsing failure
            }
        }
        const resources = [];
        for (const iface of interfaces) {
            if (!iface.ifname)
                continue;
            // Skip loopback — it's not a connectivity resource
            if (iface.ifname === 'lo')
                continue;
            const addresses = [];
            let hasIpv4 = false;
            let hasIpv6 = false;
            const dnsServers = [];
            for (const addr of iface.addr_info ?? []) {
                if (addr.local) {
                    const prefix = addr.prefixlen ?? (addr.family === 'inet6' ? 128 : 32);
                    addresses.push(`${addr.local}/${prefix}`);
                    if (addr.family === 'inet')
                        hasIpv4 = true;
                    if (addr.family === 'inet6')
                        hasIpv6 = true;
                }
            }
            // Skip interfaces with no addresses (not configured)
            if (addresses.length === 0)
                continue;
            const caps = ['monitor', 'health-check'];
            if (hasIpv4)
                caps.push('supports-ipv4');
            if (hasIpv6)
                caps.push('supports-ipv6');
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
    async getState(resourceId) {
        const resources = await this.discover();
        const resource = resourceId
            ? resources.find((r) => r.id === resourceId)
            : resources[0];
        return resource?.state ?? 'unknown';
    }
    async getHealth(resourceId) {
        const resources = await this.discover();
        const resource = resourceId
            ? resources.find((r) => r.id === resourceId)
            : resources[0];
        return (resource?.health ?? {
            score: 0,
            status: 'unhealthy',
            checkedAt: new Date().toISOString(),
            source: 'provider',
        });
    }
    async connect(resourceId) {
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
    async disconnect(resourceId) {
        return {
            ok: false,
            resourceId,
            state: 'active',
            error: 'Linux host interface lifecycle is managed by the network manager, not IRP',
        };
    }
    async activate(resourceId) {
        return this.connect(resourceId);
    }
    async deactivate(resourceId) {
        return this.disconnect(resourceId);
    }
    capabilities() {
        return ['monitor', 'health-check', 'supports-ipv4', 'supports-ipv6', 'supports-default-route'];
    }
}
