import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  AuthenticationType,
  Endpoint,
  Tunnel,
  TunnelCapability,
  TunnelConfiguration,
  TunnelConnection,
  TunnelHealth,
  TunnelProvider,
  TunnelType,
  TunnelProviderConnection,
  TunnelState,
} from './index.js';
import { TunnelError, tunnelErrors, validateTunnelConfiguration } from './index.js';

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CommandRunner {
  run(command: string, args: string[], options?: { stdin?: string; timeoutMs?: number }): Promise<CommandResult>;
}

export interface WireGuardCredentialStore {
  getPrivateKey(credentialRef: string): Promise<string>;
}

export interface WireGuardKeyPair {
  privateKey: string;
  publicKey: string;
}

export interface WireGuardPeerConfig {
  publicKey: string;
  allowedIPs: string[];
  endpoint?: string;
  persistentKeepalive?: number;
  presharedKeyRef?: string;
}

export interface WireGuardProviderOptions {
  commandRunner: CommandRunner;
  credentialStore: WireGuardCredentialStore;
  interfaceName?: string;
  commandTimeoutMs?: number;
  handshakeMaxAgeMs?: number;
  addressCidr?: string;
  peer: WireGuardPeerConfig;
  tunnelType?: TunnelType;
}

interface WireGuardRuntime {
  interfaceName: string;
  connectedAt: string;
}

const WG_COMMAND = 'wg';
const IP_COMMAND = 'ip';
const ALLOWED_PRIVATE_KEY_PATTERN = /^[A-Za-z0-9+/]{42}[=]{0,2}$/;
const ALLOWED_PUBLIC_KEY_PATTERN = ALLOWED_PRIVATE_KEY_PATTERN;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_HANDSHAKE_MAX_AGE_MS = 180_000;

const capabilities: TunnelCapability[] = [
  'ipv4',
  'ipv6',
  'udp',
  'fullTunnel',
  'systemWide',
  'authentication',
  'keepalive',
  'reconnect',
  'healthCheck',
];

function assertBase64Key(value: string, label: string, pattern = ALLOWED_PRIVATE_KEY_PATTERN): void {
  if (!pattern.test(value)) throw new TunnelError(`invalid WireGuard ${label}`, 'WireGuardInvalidKey', 'configurationFailure');
}

function assertPeer(peer: WireGuardPeerConfig): void {
  assertBase64Key(peer.publicKey, 'peer public key', ALLOWED_PUBLIC_KEY_PATTERN);
  if (peer.allowedIPs.length === 0 || peer.allowedIPs.some((cidr) => !cidr.trim())) {
    throw new Error('WireGuard peer must declare at least one allowed IP');
  }
  if (peer.persistentKeepalive !== undefined && (!Number.isInteger(peer.persistentKeepalive) || peer.persistentKeepalive < 0 || peer.persistentKeepalive > 65535)) {
    throw new Error('WireGuard persistentKeepalive must be an integer between 0 and 65535');
  }
  if (peer.endpoint !== undefined && (!peer.endpoint.trim() || peer.endpoint.length > 253)) {
    throw new Error('WireGuard peer endpoint is invalid');
  }
}

function assertInterfaceName(name: string): void {
  if (!/^[A-Za-z0-9_.-]{1,15}$/.test(name)) throw new Error('WireGuard interface name is invalid');
}

function parseNumericFields(output: string): string[] {
  return output.split(/\s+/).map((value) => value.trim()).filter(Boolean);
}

function nowIso(): string {
  return new Date().toISOString();
}

export class WireGuardProvider implements TunnelProvider {
  readonly id = 'wireguard';
  readonly type: TunnelType = 'vpn';
  readonly protocol = 'wireguard' as const;
  readonly capabilities = capabilities;
  readonly endpoints: Endpoint[];
  readonly supportedScopes = ['system' as const];
  readonly supportedRoutingModes = ['fullTunnel', 'splitTunnel' as const];

  private readonly commandRunner: CommandRunner;
  private readonly credentialStore: WireGuardCredentialStore;
  private readonly interfaceName: string;
  private readonly commandTimeoutMs: number;
  private readonly handshakeMaxAgeMs: number;
  private readonly addressCidr?: string;
  private readonly peer: WireGuardPeerConfig;
  private readonly tunnelType: TunnelType;
  private readonly runtime = new Map<string, WireGuardRuntime>();

  constructor(options: WireGuardProviderOptions) {
    this.commandRunner = options.commandRunner;
    this.credentialStore = options.credentialStore;
    this.interfaceName = options.interfaceName ?? 'irpwg0';
    this.commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.handshakeMaxAgeMs = options.handshakeMaxAgeMs ?? DEFAULT_HANDSHAKE_MAX_AGE_MS;
    this.addressCidr = options.addressCidr;
    this.peer = { ...options.peer, allowedIPs: [...options.peer.allowedIPs] };
    this.tunnelType = options.tunnelType ?? 'vpn';

    assertInterfaceName(this.interfaceName);
    assertPeer(this.peer);
    if (!Number.isInteger(this.commandTimeoutMs) || this.commandTimeoutMs <= 0) throw new Error('WireGuard commandTimeoutMs must be a positive integer');
    if (!Number.isInteger(this.handshakeMaxAgeMs) || this.handshakeMaxAgeMs <= 0) throw new Error('WireGuard handshakeMaxAgeMs must be a positive integer');
  }

  capabilities(): { protocols: string[]; transports: string[]; addressFamilies: string[]; supportsReconnect: boolean; supportsHealthCheck: boolean } {
    return {
      protocols: ['wireguard'],
      transports: ['udp'],
      addressFamilies: ['ipv4', 'ipv6', 'dual'],
      supportsReconnect: true,
      supportsHealthCheck: true,
    };
  }

  async create(config: TunnelConfiguration): Promise<Tunnel> {
    validateTunnelConfiguration(config);
    if (config.endpoint.protocol !== 'wireguard') throw tunnelErrors.unsupported('WireGuard provider requires a wireguard endpoint protocol');
    if (config.authentication.type !== 'key') throw tunnelErrors.auth('WireGuard requires key-based authentication');
    if (!config.credentialRef) throw tunnelErrors.configuration('WireGuard requires a credential reference for the private key');
    if (config.configuration?.routingMode === 'fullTunnel') {}

    const id = `wg-${randomUUID()}`;
    const created = nowIso();
    const tunnel: Tunnel = {
      id,
      type: this.tunnelType,
      providerId: this.id,
      endpoint: cloneEndpoint(config.endpoint),
      state: 'configured',
      capabilities: [...this.capabilities],
      securityProfile: config.securityProfile,
      configuration: cloneConfig(config),
      health: {
        status: 'unknown',
        connectivity: false,
        handshake: false,
        keepalive: config.keepalive.enabled,
        routeReachable: false,
        dnsReachable: false,
        authenticated: true,
        checkedAt: created,
        leakProtection: 'unknown',
      },
      metadata: { interfaceName: this.interfaceName },
    };
    return tunnel;
  }

  async connect(tunnel: Tunnel): Promise<TunnelConnection> {
    this.assertTunnel(tunnel);
    const privateKey = await this.loadPrivateKey(tunnel.configuration.authentication, tunnel.configuration.credentialRef);
    const interfaceName = this.interfaceName;

    try {
      await this.ensureInterface(interfaceName);
      const privateKeyFile = await this.createPrivateKeyFile(privateKey);
      try {
        await this.runWgSet(interfaceName, privateKeyFile.path, tunnel.configuration.keepalive.enabled ? tunnel.configuration.keepalive.intervalMs : undefined);
      } finally {
        await privateKeyFile.cleanup();
      }

      if (this.addressCidr) await this.runIp(interfaceName, ['address', 'replace', this.addressCidr, 'dev', interfaceName]);
      await this.runIp(interfaceName, ['link', 'set', 'up', 'dev', interfaceName]);

      const connectedAt = nowIso();
      this.runtime.set(tunnel.id, { interfaceName, connectedAt });

      return {
        id: `wg-conn-${randomUUID()}`,
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
      throw sanitizeWireGuardError(error);
    }
  }

  async disconnect(connection: TunnelProviderConnection, _timeoutMs: number): Promise<void> {
    const runtime = [...this.runtime.entries()].find(([, value]) => value.interfaceName === this.interfaceName && connection.id.includes('wg-conn-'));
    if (!runtime) return;
    try {
      await this.runIp(this.interfaceName, ['link', 'del', 'dev', this.interfaceName]);
    } finally {
      this.runtime.delete(runtime[0]);
    }
  }

  async destroy(tunnel: Tunnel): Promise<void> {
    const connection: TunnelProviderConnection = { id: `wg-conn-${tunnel.id}` };
    await this.disconnect(connection, this.commandTimeoutMs);
  }

  async healthCheck(tunnel?: Tunnel): Promise<TunnelHealth> {
    const checkedAt = nowIso();
    if (!tunnel) return unknownHealth(checkedAt);
    const runtime = this.runtime.get(tunnel.id);
    if (!runtime) return { ...unknownHealth(checkedAt), status: 'unhealthy', connectivity: false, authenticated: true, reason: 'WireGuard tunnel is not connected' };

    try {
      const show = await this.commandRunner.run(WG_COMMAND, ['show', runtime.interfaceName, 'latest-handshakes'], { timeoutMs: this.commandTimeoutMs });
      if (show.exitCode !== 0) throw new Error(show.stderr || 'wg latest-handshakes failed');
      const rows = parseNumericFields(show.stdout);
      const latestHandshakeSeconds = rows.length >= 2 ? Number(rows[1]) : 0;
      const nowSeconds = Math.floor(Date.now() / 1000);
      const handshakeAgeMs = latestHandshakeSeconds > 0 ? Math.max(0, nowSeconds - latestHandshakeSeconds) * 1000 : Number.POSITIVE_INFINITY;
      const handshake = handshakeAgeMs <= this.handshakeMaxAgeMs;

      const interfaceState = await this.commandRunner.run(IP_COMMAND, ['link', 'show', 'dev', runtime.interfaceName], { timeoutMs: this.commandTimeoutMs });
      const up = interfaceState.exitCode === 0 && /\bUP\b/.test(interfaceState.stdout);
      const connected = up && handshake;
      return {
        status: connected ? 'healthy' : up ? 'degraded' : 'unhealthy',
        connectivity: up,
        handshake,
        keepalive: tunnel.configuration.keepalive.enabled,
        routeReachable: up,
        dnsReachable: false,
        authenticated: true,
        checkedAt,
        leakProtection: 'unknown',
        ...(Number.isFinite(handshakeAgeMs) ? { metadata: { handshakeAgeMs } } : {}),
      } as TunnelHealth;
    } catch (error) {
      return {
        ...unknownHealth(checkedAt),
        status: 'unhealthy',
        authenticated: true,
        leakProtection: 'unknown',
        reason: error instanceof Error ? error.message : 'WireGuard health check failed',
      } as TunnelHealth;
    }
  }

  static async generateKeyPair(commandRunner: CommandRunner): Promise<WireGuardKeyPair> {
    const privateResult = await commandRunner.run(WG_COMMAND, ['genkey']);
    if (privateResult.exitCode !== 0) throw new Error(privateResult.stderr || 'WireGuard private key generation failed');
    const privateKey = privateResult.stdout.trim();
    assertBase64Key(privateKey, 'private key');

    const publicResult = await commandRunner.run(WG_COMMAND, ['pubkey'], { stdin: `${privateKey}\n` });
    if (publicResult.exitCode !== 0) throw new Error(publicResult.stderr || 'WireGuard public key derivation failed');
    const publicKey = publicResult.stdout.trim();
    assertBase64Key(publicKey, 'public key');
    return { privateKey, publicKey };
  }

  private async loadPrivateKey(authentication: { type: AuthenticationType; credentialRef?: string }, credentialRef?: string): Promise<string> {
    if (authentication.type !== 'key' || !credentialRef) throw tunnelErrors.auth('WireGuard private key reference is required');
    const privateKey = (await this.credentialStore.getPrivateKey(credentialRef)).trim();
    assertBase64Key(privateKey, 'private key');
    return privateKey;
  }

  private async ensureInterface(interfaceName: string): Promise<void> {
    const result = await this.commandRunner.run(IP_COMMAND, ['link', 'show', 'dev', interfaceName], { timeoutMs: this.commandTimeoutMs });
    if (result.exitCode === 0) return;
    await this.runIp(interfaceName, ['link', 'add', 'dev', interfaceName, 'type', 'wireguard']);
  }

  private async runWgSet(interfaceName: string, privateKeyFile: string, keepaliveMs?: number): Promise<void> {
    const args = ['set', interfaceName, 'private-key', privateKeyFile, 'peer', this.peer.publicKey, 'allowed-ips', this.peer.allowedIPs.join(',')];
    if (this.peer.endpoint) args.push('endpoint', this.peer.endpoint);
    if (keepaliveMs !== undefined && keepaliveMs > 0) args.push('persistent-keepalive', String(Math.max(1, Math.min(65535, Math.round(keepaliveMs / 1000)))));
    if (this.peer.presharedKeyRef) throw new Error('WireGuard presharedKeyRef requires a dedicated secret provider and is not enabled in Phase 49');
    const result = await this.commandRunner.run(WG_COMMAND, args, { timeoutMs: this.commandTimeoutMs });
    if (result.exitCode !== 0) throw new Error(result.stderr || 'WireGuard configuration failed');
  }

  private async runIp(_interfaceName: string, args: string[]): Promise<void> {
    const result = await this.commandRunner.run(IP_COMMAND, args, { timeoutMs: this.commandTimeoutMs });
    if (result.exitCode !== 0) throw new Error(result.stderr || `ip ${args.join(' ')} failed`);
  }

  private async createPrivateKeyFile(privateKey: string): Promise<{ path: string; cleanup: () => Promise<void> }> {
    const dir = await mkdtemp(join(tmpdir(), 'irp-wg-'));
    const path = join(dir, 'privatekey');
    await writeFile(path, `${privateKey}\n`, { mode: 0o600 });
    return {
      path,
      cleanup: async () => {
        await rm(dir, { recursive: true, force: true });
      },
    };
  }

  private assertTunnel(tunnel: Tunnel): void {
    if (tunnel.providerId !== this.id) throw tunnelErrors.configuration('Tunnel is not owned by WireGuard provider');
    if (tunnel.endpoint.protocol !== 'wireguard') throw tunnelErrors.unsupported('Tunnel endpoint is not WireGuard');
    if (!tunnel.configuration.credentialRef) throw tunnelErrors.auth('WireGuard tunnel is missing private-key credential reference');
    if (this.peer.allowedIPs.length === 0) throw tunnelErrors.configuration('WireGuard peer has no allowed IPs');
  }
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
    ...(config.splitTunnel ? { splitTunnel: { ...config.splitTunnel, includedDestinations: [...config.splitTunnel.includedDestinations], excludedDestinations: [...config.splitTunnel.excludedDestinations] } } : {}),
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

function sanitizeWireGuardError(error: unknown): Error {
  if (error instanceof TunnelError) return error;
  const message = error instanceof Error ? error.message : 'WireGuard operation failed';
  const sanitized = message.replace(/[A-Za-z0-9+/]{42}[=]{0,2}/g, '[REDACTED_KEY]');
  return new TunnelError(sanitized, 'WireGuardOperationFailed', 'dependencyFailure', true);
}
