import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Endpoint, Tunnel, TunnelCapability, TunnelConfiguration, TunnelConnection, TunnelHealth, TunnelProvider, TunnelProviderConnection, TunnelType } from './index.js';
import { TunnelError, tunnelErrors, validateTunnelConfiguration } from './index.js';

const execFileAsync = promisify(execFile);
const WG_COMMAND = 'wg';
const IP_COMMAND = 'ip';
const KEY_PATTERN = /^[A-Za-z0-9+/]{42}[=]{0,2}$/;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_HANDSHAKE_MAX_AGE_MS = 180_000;

export interface CommandResult { stdout: string; stderr: string; exitCode: number }
export interface CommandRunner { run(command: string, args: string[], options?: { stdin?: string; timeoutMs?: number }): Promise<CommandResult> }

export class NodeCommandRunner implements CommandRunner {
  async run(command: string, args: string[], options: { stdin?: string; timeoutMs?: number } = {}): Promise<CommandResult> {
    try {
      const child = execFileAsync(command, args, { timeout: options.timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true });
      if (options.stdin !== undefined && child.child.stdin) child.child.stdin.end(options.stdin);
      const result = await child;
      return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string };
      return { stdout: failure.stdout ?? '', stderr: failure.stderr ?? failure.message ?? 'command failed', exitCode: typeof failure.code === 'number' ? failure.code : 1 };
    }
  }
}

export interface WireGuardCredentialStore { getPrivateKey(credentialRef: string): Promise<string> }
export interface WireGuardKeyPair { privateKey: string; publicKey: string }
export interface WireGuardPeerConfig { publicKey: string; allowedIPs: string[]; endpoint?: string; persistentKeepalive?: number }
export interface WireGuardProviderOptions {
  commandRunner?: CommandRunner;
  credentialStore: WireGuardCredentialStore;
  interfaceName?: string;
  commandTimeoutMs?: number;
  handshakeMaxAgeMs?: number;
  addressCidr?: string;
  peer: WireGuardPeerConfig;
  tunnelType?: TunnelType;
}

interface WireGuardRuntime { interfaceName: string; connectionId: string; connectedAt: string }
const capabilities: TunnelCapability[] = ['ipv4', 'ipv6', 'udp', 'fullTunnel', 'systemWide', 'authentication', 'keepalive', 'reconnect', 'healthCheck'];

export class WireGuardProvider implements TunnelProvider {
  readonly id = 'wireguard';
  readonly type: TunnelType = 'vpn';
  readonly protocol = 'wireguard' as const;
  readonly endpoints: Endpoint[] = [];
  readonly supportedScopes = ['system' as const];
  readonly supportedRoutingModes = ['fullTunnel', 'splitTunnel' as const];
  readonly capabilities = capabilities;

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
    this.commandRunner = options.commandRunner ?? new NodeCommandRunner();
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

  capabilitiesInfo() { return { protocols: ['wireguard'], transports: ['udp'], addressFamilies: ['ipv4', 'ipv6', 'dual'], supportsReconnect: true, supportsHealthCheck: true }; }

  async create(config: TunnelConfiguration): Promise<Tunnel> {
    validateTunnelConfiguration(config);
    if (config.endpoint.protocol !== 'wireguard') throw tunnelErrors.unsupported('WireGuard provider requires a wireguard endpoint protocol');
    if (config.authentication.type !== 'key') throw tunnelErrors.auth('WireGuard requires key-based authentication');
    if (!config.credentialRef) throw tunnelErrors.configuration('WireGuard requires a credential reference for the private key');
    const created = new Date().toISOString();
    return {
      id: `wg-${randomUUID()}`,
      type: this.tunnelType,
      providerId: this.id,
      endpoint: cloneEndpoint(config.endpoint),
      state: 'configured',
      capabilities: [...this.capabilities],
      securityProfile: config.securityProfile,
      configuration: cloneConfig(config),
      health: { status: 'unknown', connectivity: false, handshake: false, keepalive: config.keepalive.enabled, routeReachable: false, dnsReachable: false, authenticated: true, checkedAt: created, leakProtection: 'unknown' },
      metadata: { interfaceName: this.interfaceName },
    };
  }

  async connect(tunnel: Tunnel): Promise<TunnelConnection> {
    this.assertTunnel(tunnel);
    const privateKey = await this.loadPrivateKey(tunnel.configuration.credentialRef);
    let createdInterface = false;
    try {
      createdInterface = await this.ensureInterface();
      const keyFile = await this.createPrivateKeyFile(privateKey);
      try { await this.runWgSet(keyFile.path, tunnel.configuration.keepalive.intervalMs, tunnel.endpoint); }
      finally { await keyFile.cleanup(); }
      if (this.addressCidr) await this.runIp(['address', 'replace', this.addressCidr, 'dev', this.interfaceName]);
      await this.runIp(['link', 'set', 'up', 'dev', this.interfaceName]);
      const connectedAt = new Date().toISOString();
      const connectionId = `wg-conn-${randomUUID()}`;
      this.runtime.set(tunnel.id, { interfaceName: this.interfaceName, connectionId, connectedAt });
      return { id: connectionId, tunnelId: tunnel.id, state: 'connected', establishedAt: connectedAt, statistics: { bytesSent: 0, bytesReceived: 0, packetsSent: 0, packetsReceived: 0, handshakeCount: 0, reconnectCount: 0, uptimeMs: 0 } };
    } catch (error) {
      this.runtime.delete(tunnel.id);
      if (createdInterface) { try { await this.runIp(['link', 'del', 'dev', this.interfaceName]); } catch { /* preserve original failure */ } }
      throw sanitizeWireGuardError(error);
    }
  }

  async disconnect(connection: TunnelProviderConnection, _timeoutMs: number): Promise<void> {
    const entry = [...this.runtime.entries()].find(([, value]) => value.connectionId === connection.id);
    if (!entry) return;
    try { await this.runIp(['link', 'del', 'dev', entry[1].interfaceName]); }
    finally { this.runtime.delete(entry[0]); }
  }

  async destroy(tunnel: Tunnel): Promise<void> {
    const runtime = this.runtime.get(tunnel.id);
    if (runtime) await this.disconnect({ id: runtime.connectionId }, this.commandTimeoutMs);
  }

  async healthCheck(tunnel?: Tunnel): Promise<TunnelHealth> {
    const checkedAt = new Date().toISOString();
    if (!tunnel) return unknownHealth(checkedAt);
    const runtime = this.runtime.get(tunnel.id);
    if (!runtime) return { ...unknownHealth(checkedAt), status: 'unhealthy', authenticated: true };
    try {
      const show = await this.commandRunner.run(WG_COMMAND, ['show', runtime.interfaceName, 'latest-handshakes'], { timeoutMs: this.commandTimeoutMs });
      if (show.exitCode !== 0) throw new Error(show.stderr || 'WireGuard latest-handshakes query failed');
      const latestHandshake = parseLatestHandshake(show.stdout);
      const handshakeAgeMs = latestHandshake === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Date.now() - latestHandshake * 1000);
      const handshake = handshakeAgeMs <= this.handshakeMaxAgeMs;
      const state = await this.commandRunner.run(IP_COMMAND, ['link', 'show', 'dev', runtime.interfaceName], { timeoutMs: this.commandTimeoutMs });
      const up = state.exitCode === 0 && /\bstate UP\b|<[^>]*UP[^>]*>/.test(state.stdout);
      return { status: up && handshake ? 'healthy' : up ? 'degraded' : 'unhealthy', connectivity: up, handshake, keepalive: tunnel.configuration.keepalive.enabled, routeReachable: up, dnsReachable: false, authenticated: true, checkedAt, leakProtection: 'unknown' };
    } catch {
      return { ...unknownHealth(checkedAt), status: 'unhealthy', authenticated: true };
    }
  }

  static async generateKeyPair(commandRunner: CommandRunner = new NodeCommandRunner()): Promise<WireGuardKeyPair> {
    const privateResult = await commandRunner.run(WG_COMMAND, ['genkey']);
    if (privateResult.exitCode !== 0) throw new Error(privateResult.stderr || 'WireGuard private key generation failed');
    const privateKey = privateResult.stdout.trim();
    assertKey(privateKey, 'private key');
    const publicResult = await commandRunner.run(WG_COMMAND, ['pubkey'], { stdin: `${privateKey}\n` });
    if (publicResult.exitCode !== 0) throw new Error(publicResult.stderr || 'WireGuard public key derivation failed');
    const publicKey = publicResult.stdout.trim();
    assertKey(publicKey, 'public key');
    return { privateKey, publicKey };
  }

  private async loadPrivateKey(credentialRef: string | undefined): Promise<string> {
    if (!credentialRef) throw tunnelErrors.auth('WireGuard private key credential reference is required');
    const key = (await this.credentialStore.getPrivateKey(credentialRef)).trim();
    assertKey(key, 'private key');
    return key;
  }

  private async ensureInterface(): Promise<boolean> {
    const result = await this.commandRunner.run(IP_COMMAND, ['link', 'show', 'dev', this.interfaceName], { timeoutMs: this.commandTimeoutMs });
    if (result.exitCode === 0) return false;
    await this.runIp(['link', 'add', 'dev', this.interfaceName, 'type', 'wireguard']);
    return true;
  }

  private async runWgSet(privateKeyFile: string, keepaliveMs: number, endpoint: Endpoint): Promise<void> {
    const peerEndpoint = this.peer.endpoint ?? formatEndpoint(endpoint);
    const keepaliveSeconds = this.peer.persistentKeepalive ?? (keepaliveMs > 0 ? Math.max(1, Math.min(65535, Math.round(keepaliveMs / 1000))) : 0);
    const args = ['set', this.interfaceName, 'private-key', privateKeyFile, 'peer', this.peer.publicKey, 'allowed-ips', this.peer.allowedIPs.join(','), 'endpoint', peerEndpoint];
    if (keepaliveSeconds > 0) args.push('persistent-keepalive', String(keepaliveSeconds));
    const result = await this.commandRunner.run(WG_COMMAND, args, { timeoutMs: this.commandTimeoutMs });
    if (result.exitCode !== 0) throw new Error(result.stderr || 'WireGuard configuration failed');
  }

  private async runIp(args: string[]): Promise<void> {
    const result = await this.commandRunner.run(IP_COMMAND, args, { timeoutMs: this.commandTimeoutMs });
    if (result.exitCode !== 0) throw new Error(result.stderr || `ip ${args.join(' ')} failed`);
  }

  private async createPrivateKeyFile(privateKey: string): Promise<{ path: string; cleanup: () => Promise<void> }> {
    const dir = await mkdtemp(join(tmpdir(), 'irp-wg-'));
    const path = join(dir, 'privatekey');
    try { await writeFile(path, `${privateKey}\n`, { mode: 0o600 }); }
    catch (error) { await rm(dir, { recursive: true, force: true }); throw error; }
    return { path, cleanup: () => rm(dir, { recursive: true, force: true }) };
  }

  private assertTunnel(tunnel: Tunnel): void {
    if (tunnel.providerId !== this.id) throw tunnelErrors.configuration('Tunnel is not owned by WireGuard provider');
    if (tunnel.endpoint.protocol !== 'wireguard') throw tunnelErrors.unsupported('Tunnel endpoint is not WireGuard');
    if (tunnel.configuration.authentication.type !== 'key') throw tunnelErrors.auth('WireGuard requires key-based authentication');
    if (!tunnel.configuration.credentialRef) throw tunnelErrors.auth('WireGuard tunnel is missing private-key credential reference');
  }
}

function assertKey(value: string, label: string): void {
  if (!KEY_PATTERN.test(value)) throw new TunnelError(`invalid WireGuard ${label}`, 'WireGuardInvalidKey', 'configurationFailure');
}
function assertPeer(peer: WireGuardPeerConfig): void {
  assertKey(peer.publicKey, 'peer public key');
  if (peer.allowedIPs.length === 0 || peer.allowedIPs.some((cidr) => !cidr.trim())) throw new Error('WireGuard peer must declare at least one allowed IP');
  if (peer.persistentKeepalive !== undefined && (!Number.isInteger(peer.persistentKeepalive) || peer.persistentKeepalive < 0 || peer.persistentKeepalive > 65535)) throw new Error('WireGuard persistentKeepalive must be an integer between 0 and 65535');
  if (peer.endpoint !== undefined && (!peer.endpoint.trim() || peer.endpoint.length > 253)) throw new Error('WireGuard peer endpoint is invalid');
}
function assertInterfaceName(name: string): void { if (!/^[A-Za-z0-9_.-]{1,15}$/.test(name)) throw new Error('WireGuard interface name is invalid'); }
function formatEndpoint(endpoint: Endpoint): string { const host = endpoint.addressFamily === 'ipv6' && !endpoint.host.startsWith('[') ? `[${endpoint.host}]` : endpoint.host; return `${host}:${endpoint.port}`; }
function parseLatestHandshake(output: string): number | undefined { const values = output.split(/\s+/).map(Number).filter((value) => Number.isSafeInteger(value) && value > 0); return values.length ? Math.max(...values) : undefined; }
function cloneEndpoint(endpoint: Endpoint): Endpoint { return { ...endpoint, metadata: { ...endpoint.metadata } }; }
function cloneConfig(config: TunnelConfiguration): TunnelConfiguration { return { ...config, endpoint: cloneEndpoint(config.endpoint), authentication: { ...config.authentication }, capabilities: [...config.capabilities], keepalive: { ...config.keepalive }, mtu: { ...config.mtu }, ...(config.splitTunnel ? { splitTunnel: { ...config.splitTunnel, includedDestinations: [...config.splitTunnel.includedDestinations], excludedDestinations: [...config.splitTunnel.excludedDestinations] } } : {}) }; }
function unknownHealth(checkedAt: string): TunnelHealth { return { status: 'unknown', connectivity: false, handshake: false, keepalive: false, routeReachable: false, dnsReachable: false, authenticated: false, checkedAt, leakProtection: 'unknown' }; }
function sanitizeWireGuardError(error: unknown): Error { if (error instanceof TunnelError) return error; const message = error instanceof Error ? error.message : 'WireGuard operation failed'; return new TunnelError(message.replace(KEY_PATTERN, '[REDACTED_KEY]'), 'WireGuardOperationFailed', 'dependencyFailure', true); }
