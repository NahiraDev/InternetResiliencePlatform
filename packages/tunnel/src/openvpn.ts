import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type {
  Endpoint,
  RoutingMode,
  Tunnel,
  TunnelCapability,
  TunnelConfiguration,
  TunnelConnection,
  TunnelHealth,
  TunnelProvider,
  TunnelScope,
  TunnelType,
} from './index.js';
import { TunnelError, tunnelErrors, validateTunnelConfiguration } from './index.js';

const execFileAsync = promisify(execFile);
const OPENVPN_COMMAND = 'openvpn';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_STARTUP_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_INTERVAL_MS = 100;
const capabilities: TunnelCapability[] = [
  'ipv4',
  'ipv6',
  'udp',
  'tcp',
  'fullTunnel',
  'splitRouting',
  'systemWide',
  'authentication',
  'keepalive',
  'reconnect',
  'healthCheck',
];

export interface OpenVPNCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface OpenVPNCommandRunner {
  run(
    command: string,
    args: string[],
    options?: { timeoutMs?: number },
  ): Promise<OpenVPNCommandResult>;
}

export class NodeOpenVPNCommandRunner implements OpenVPNCommandRunner {
  async run(
    command: string,
    args: string[],
    options: { timeoutMs?: number } = {},
  ): Promise<OpenVPNCommandResult> {
    try {
      const result = await execFileAsync(command, args, {
        timeout: options.timeoutMs,
        maxBuffer: 1024 * 1024,
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
}

export interface OpenVPNCredentialStore {
  getClientConfig(credentialRef: string): Promise<string>;
}

export interface OpenVPNProviderOptions {
  credentialStore: OpenVPNCredentialStore;
  commandRunner?: OpenVPNCommandRunner;
  commandTimeoutMs?: number;
  startupTimeoutMs?: number;
  pollIntervalMs?: number;
  tunnelType?: TunnelType;
}

interface OpenVPNRuntime {
  pid: number;
  connectionId: string;
  connectedAt: string;
  directory: string;
  configPath: string;
  pidPath: string;
  statusPath: string;
}

export class OpenVPNProvider implements TunnelProvider {
  readonly id = 'openvpn';
  readonly type: TunnelType = 'vpn';
  readonly protocol = 'openvpn' as const;
  readonly endpoints: Endpoint[] = [];
  readonly supportedScopes: TunnelScope[] = ['system'];
  readonly supportedRoutingModes: RoutingMode[] = ['fullTunnel', 'splitTunnel'];
  readonly capabilities = capabilities;

  private readonly commandRunner: OpenVPNCommandRunner;
  private readonly credentialStore: OpenVPNCredentialStore;
  private readonly commandTimeoutMs: number;
  private readonly startupTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly tunnelType: TunnelType;
  private readonly runtime = new Map<string, OpenVPNRuntime>();

  constructor(options: OpenVPNProviderOptions) {
    this.commandRunner = options.commandRunner ?? new NodeOpenVPNCommandRunner();
    this.credentialStore = options.credentialStore;
    this.commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.tunnelType = options.tunnelType ?? 'vpn';

    assertPositiveInteger(this.commandTimeoutMs, 'commandTimeoutMs');
    assertPositiveInteger(this.startupTimeoutMs, 'startupTimeoutMs');
    assertPositiveInteger(this.pollIntervalMs, 'pollIntervalMs');
  }

  capabilitiesInfo() {
    return {
      protocols: ['openvpn'],
      transports: ['udp', 'tcp'],
      addressFamilies: ['ipv4', 'ipv6', 'dual'],
      supportsReconnect: true,
      supportsHealthCheck: true,
    };
  }

  async create(config: TunnelConfiguration): Promise<Tunnel> {
    validateTunnelConfiguration(config);
    if (config.endpoint.protocol !== 'openvpn') {
      throw tunnelErrors.unsupported('OpenVPN provider requires an openvpn endpoint protocol');
    }
    if (config.authentication.type === 'none') {
      throw tunnelErrors.auth('OpenVPN requires authenticated client configuration');
    }
    if (!config.credentialRef) {
      throw tunnelErrors.configuration('OpenVPN requires a credential reference for the client configuration');
    }

    const createdAt = new Date().toISOString();
    return {
      id: `ovpn-${randomUUID()}`,
      type: this.tunnelType,
      providerId: this.id,
      endpoint: cloneEndpoint(config.endpoint),
      state: 'configured',
      capabilities: [...this.capabilities],
      securityProfile: config.securityProfile,
      configuration: cloneConfig(config),
      health: unknownHealth(createdAt),
      metadata: { provider: 'openvpn' },
    };
  }

  async connect(tunnel: Tunnel): Promise<TunnelConnection> {
    this.assertTunnel(tunnel);
    if (this.runtime.has(tunnel.id)) {
      throw tunnelErrors.state('OpenVPN tunnel is already connected', { tunnelId: tunnel.id });
    }

    const credentialRef = tunnel.configuration.credentialRef;
    if (!credentialRef) {
      throw tunnelErrors.auth('OpenVPN credential reference is required');
    }

    const config = await this.credentialStore.getClientConfig(credentialRef);
    validateClientConfig(config);

    const directory = await mkdtemp(join(tmpdir(), 'irp-ovpn-'));
    const configPath = join(directory, 'client.conf');
    const pidPath = join(directory, 'openvpn.pid');
    const statusPath = join(directory, 'openvpn.status');

    try {
      await writeFile(configPath, `${config.trim()}\n`, { mode: 0o600 });
      const result = await this.commandRunner.run(
        OPENVPN_COMMAND,
        [
          '--config',
          configPath,
          '--writepid',
          pidPath,
          '--status',
          statusPath,
          '5',
          '--status-version',
          '3',
          '--daemon',
          'irp-openvpn',
        ],
        { timeoutMs: this.commandTimeoutMs },
      );

      if (result.exitCode !== 0) {
        throw new TunnelError(
          sanitizeOutput(result.stderr || result.stdout || 'OpenVPN failed to start'),
          'OpenVPNStartFailed',
          'dependencyFailure',
          true,
        );
      }

      const pid = await this.waitForPid(pidPath);
      const connectionId = `ovpn-conn-${randomUUID()}`;
      const connectedAt = new Date().toISOString();
      this.runtime.set(tunnel.id, {
        pid,
        connectionId,
        connectedAt,
        directory,
        configPath,
        pidPath,
        statusPath,
      });

      const health = await this.waitForHealthy(tunnel);
      if (health.status !== 'healthy') {
        await this.stopRuntime(tunnel.id, pid);
        throw new TunnelError(
          'OpenVPN process started but did not provide healthy tunnel evidence before the startup deadline',
          'OpenVPNHealthCheckFailed',
          'dependencyFailure',
          true,
          { healthStatus: health.status },
        );
      }

      return {
        id: connectionId,
        tunnelId: tunnel.id,
        state: 'connected',
        establishedAt: connectedAt,
        statistics: {
          bytesSent: 0,
          bytesReceived: 0,
          packetsSent: 0,
          packetsReceived: 0,
          handshakeCount: 0,
          reconnectCount: 0,
          uptimeMs: 0,
        },
      };
    } catch (error) {
      this.runtime.delete(tunnel.id);
      await rm(directory, { recursive: true, force: true });
      throw sanitizeOpenVPNError(error);
    }
  }

  async disconnect(connection: TunnelConnection, timeoutMs: number): Promise<void> {
    const entry = [...this.runtime.entries()].find(([, value]) => value.connectionId === connection.id);
    if (!entry) return;

    const [tunnelId, runtime] = entry;
    try {
      await this.stopRuntime(tunnelId, runtime.pid, timeoutMs);
    } finally {
      this.runtime.delete(tunnelId);
      await rm(runtime.directory, { recursive: true, force: true });
    }
  }

  async destroy(tunnel: Tunnel): Promise<void> {
    const runtime = this.runtime.get(tunnel.id);
    if (!runtime) return;
    await this.stopRuntime(tunnel.id, runtime.pid, this.commandTimeoutMs);
    this.runtime.delete(tunnel.id);
    await rm(runtime.directory, { recursive: true, force: true });
  }

  async healthCheck(tunnel?: Tunnel): Promise<TunnelHealth> {
    const checkedAt = new Date().toISOString();
    if (!tunnel) return unknownHealth(checkedAt);

    const runtime = this.runtime.get(tunnel.id);
    if (!runtime) return { ...unknownHealth(checkedAt), status: 'unhealthy' };

    try {
      if (!isProcessAlive(runtime.pid)) {
        return { ...unknownHealth(checkedAt), status: 'unhealthy' };
      }

      const status = await readFile(runtime.statusPath, 'utf8').catch(() => '');
      const connected = /CONNECTED,SUCCESS\b/.test(status) || /CONNECTED,SUCCESS\t/.test(status);
      const bytes = parseClientStats(status);
      return {
        status: connected ? 'healthy' : 'degraded',
        connectivity: connected,
        handshake: connected,
        keepalive: tunnel.configuration.keepalive.enabled,
        routeReachable: connected,
        dnsReachable: false,
        authenticated: connected,
        checkedAt,
        leakProtection: 'unknown',
        ...bytes,
      };
    } catch {
      return { ...unknownHealth(checkedAt), status: 'unhealthy' };
    }
  }

  private async waitForHealthy(tunnel: Tunnel): Promise<TunnelHealth> {
    const deadline = Date.now() + this.startupTimeoutMs;
    let last = await this.healthCheck(tunnel);
    while (last.status !== 'healthy' && Date.now() < deadline) {
      await delay(Math.min(this.pollIntervalMs, Math.max(1, deadline - Date.now())));
      last = await this.healthCheck(tunnel);
    }
    return last;
  }

  private async waitForPid(pidPath: string): Promise<number> {
    const deadline = Date.now() + this.startupTimeoutMs;
    while (Date.now() < deadline) {
      const value = await readFile(pidPath, 'utf8').catch(() => '');
      const pid = Number.parseInt(value.trim(), 10);
      if (Number.isSafeInteger(pid) && pid > 1 && isProcessAlive(pid)) return pid;
      await delay(this.pollIntervalMs);
    }
    throw new TunnelError('OpenVPN did not publish a live process id before the startup deadline', 'OpenVPNStartupTimeout', 'dependencyFailure', true);
  }

  private async stopRuntime(tunnelId: string, pid: number, timeoutMs = this.commandTimeoutMs): Promise<void> {
    if (!isProcessAlive(pid)) return;
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!isProcessAlive(pid)) return;
      await delay(Math.min(this.pollIntervalMs, 250));
    }

    if (isProcessAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
          throw new TunnelError('OpenVPN process could not be terminated', 'OpenVPNStopFailed', 'dependencyFailure', true, { tunnelId });
        }
      }
    }
  }

  private assertTunnel(tunnel: Tunnel): void {
    if (tunnel.providerId !== this.id) throw tunnelErrors.configuration('Tunnel is not owned by OpenVPN provider');
    if (tunnel.endpoint.protocol !== 'openvpn') throw tunnelErrors.unsupported('Tunnel endpoint is not OpenVPN');
    if (tunnel.configuration.authentication.type === 'none') throw tunnelErrors.auth('OpenVPN requires authenticated client configuration');
    if (!tunnel.configuration.credentialRef) throw tunnelErrors.auth('OpenVPN tunnel is missing client configuration credential reference');
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`OpenVPN ${name} must be a positive integer`);
}

function validateClientConfig(config: string): void {
  if (!config.trim() || config.length > 1024 * 1024) throw tunnelErrors.configuration('OpenVPN client configuration is empty or too large');
  if (/^\s*(script-security|up|down|route-up|route-pre-down|client-connect|client-disconnect|tls-verify|learn-address)\b/im.test(config)) {
    throw tunnelErrors.policy('OpenVPN client configuration contains executable script hooks that are not permitted');
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parseClientStats(status: string): Pick<TunnelHealth, 'throughputBps'> {
  const match = status.match(/TUN\/TAP read bytes,write bytes,(\d+),(\d+)/);
  if (!match) return {};
  return { throughputBps: Number(match[1]) + Number(match[2]) };
}

function sanitizeOutput(value: string): string {
  return value.replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '[REDACTED_CERTIFICATE]').slice(0, 2048);
}

function sanitizeOpenVPNError(error: unknown): Error {
  if (error instanceof TunnelError) return error;
  const message = error instanceof Error ? error.message : 'OpenVPN operation failed';
  return new TunnelError(sanitizeOutput(message), 'OpenVPNOperationFailed', 'dependencyFailure', true);
}

function cloneEndpoint(endpoint: Endpoint): Endpoint {
  return { ...endpoint, metadata: { ...endpoint.metadata } };
}

function cloneConfig(config: TunnelConfiguration): TunnelConfiguration {
  return {
    ...config,
    endpoint: cloneEndpoint(config.endpoint),
    authentication: { ...config.authentication },
    capabilities: [...config.capabilities],
    keepalive: { ...config.keepalive },
    mtu: { ...config.mtu },
    ...(config.splitTunnel
      ? {
          splitTunnel: {
            ...config.splitTunnel,
            includedDestinations: [...config.splitTunnel.includedDestinations],
            excludedDestinations: [...config.splitTunnel.excludedDestinations],
          },
        }
      : {}),
  };
}

function unknownHealth(checkedAt: string): TunnelHealth {
  return {
    status: 'unknown',
    connectivity: false,
    handshake: false,
    keepalive: false,
    routeReachable: false,
    dnsReachable: false,
    authenticated: false,
    checkedAt,
    leakProtection: 'unknown',
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
