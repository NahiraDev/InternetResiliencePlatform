import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
export interface TunnelEventBus {
  publish(event: {
    id: string;
    type: string;
    aggregateId: string;
    occurredAt: Date;
    payload: unknown;
    metadata?: Record<string, string>;
  }): Promise<void>;
}
export interface TunnelMetrics {
  record(name: string, value: number, labels?: Record<string, string>): void;
}

const id = (p: string) => `${p}_${randomUUID()}`;
const now = () => new Date().toISOString();

export type TunnelType =
  'vpn' | 'proxy' | 'secure-tunnel' | 'local-tunnel' | 'remote-tunnel' | 'custom-transport';
export type TunnelProtocol =
  'wireguard' | 'openvpn' | 'socks5' | 'http-connect' | 'https-proxy' | 'ssh' | 'quic' | 'custom';
export type AddressFamily = 'ipv4' | 'ipv6' | 'dual';
export type TunnelCapability =
  | 'ipv4'
  | 'ipv6'
  | 'udp'
  | 'tcp'
  | 'dns'
  | 'splitRouting'
  | 'fullTunnel'
  | 'proxyOnly'
  | 'systemWide'
  | 'applicationScoped'
  | 'processScoped'
  | 'serviceScoped'
  | 'authentication'
  | 'keepalive'
  | 'reconnect'
  | 'healthCheck'
  | 'killSwitch'
  | 'MTUControl';
export type TunnelState =
  | 'registered'
  | 'configured'
  | 'preparing'
  | 'connecting'
  | 'authenticating'
  | 'establishing'
  | 'connected'
  | 'degraded'
  | 'disconnecting'
  | 'disconnected'
  | 'failed'
  | 'recovering'
  | 'destroyed';
export type RoutingMode = 'fullTunnel' | 'splitTunnel' | 'proxyOnly' | 'custom';
export type TunnelScope = 'application' | 'process' | 'service' | 'system';
export type SecurityProfile = 'strict' | 'secure' | 'balanced' | 'compatibility';
export type AuthenticationType =
  'none' | 'credentials' | 'certificate' | 'key' | 'token' | 'platform-identity';
export type DnsMode =
  'insideTunnel' | 'outsideTunnel' | 'secureDnsIndependent' | 'resolverDecision';
export type LeakProtectionState = 'protected' | 'degraded' | 'leakDetected' | 'unknown';
export type ErrorClassification =
  | 'retryable'
  | 'nonRetryable'
  | 'securityFailure'
  | 'policyFailure'
  | 'configurationFailure'
  | 'dependencyFailure'
  | 'resourceFailure';

export interface Endpoint {
  host: string;
  port: number;
  protocol: TunnelProtocol;
  addressFamily: AddressFamily;
  metadata: Record<string, unknown>;
}
export interface CredentialReference {
  credentialRef: string;
  type: Exclude<AuthenticationType, 'none'>;
}
export interface TunnelAuthentication {
  type: AuthenticationType;
  credentialRef?: string;
  certificateRef?: string;
  keyRef?: string;
  tokenRef?: string;
}
export interface KeepaliveConfig {
  enabled: boolean;
  intervalMs: number;
  timeoutMs: number;
}
export interface MtuConfig {
  configuredMtu?: number;
  detectedMtu?: number;
  effectiveMtu?: number;
  validationStatus: 'valid' | 'invalid' | 'unknown';
}
export interface SplitTunnelConfig {
  includedDestinations: string[];
  excludedDestinations: string[];
  precedence: 'include' | 'exclude';
  policyRef?: string;
}
export interface TunnelConfiguration {
  endpoint: Endpoint;
  routingMode: RoutingMode;
  scope: TunnelScope;
  dnsMode: DnsMode;
  authentication: TunnelAuthentication;
  securityProfile: SecurityProfile;
  capabilities: TunnelCapability[];
  keepalive: KeepaliveConfig;
  mtu: MtuConfig;
  timeoutMs: number;
  retryLimit: number;
  splitTunnel?: SplitTunnelConfig;
  credentialRef?: string;
  metadata?: Record<string, unknown>;
}
export interface TunnelHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  connectivity: boolean;
  handshake: boolean;
  latencyMs?: number;
  packetLoss?: number;
  throughputBps?: number;
  keepalive: boolean;
  routeReachable: boolean;
  dnsReachable: boolean;
  authenticated: boolean;
  checkedAt: string;
  leakProtection: LeakProtectionState;
}
export interface TunnelStatistics {
  bytesSent: number;
  bytesReceived: number;
  packetsSent: number;
  packetsReceived: number;
  handshakeCount: number;
  reconnectCount: number;
  uptimeMs: number;
  latencyMs?: number;
  packetLoss?: number;
  lastHandshake?: string;
}
export interface Tunnel {
  id: string;
  type: TunnelType;
  providerId: string;
  endpoint: Endpoint;
  state: TunnelState;
  capabilities: TunnelCapability[];
  securityProfile: SecurityProfile;
  configuration: TunnelConfiguration;
  health: TunnelHealth;
  metadata: Record<string, unknown>;
}
export interface Proxy {
  id: string;
  type: Extract<TunnelProtocol, 'socks5' | 'http-connect' | 'https-proxy'>;
  endpoint: Endpoint;
  authentication: TunnelAuthentication;
  capabilities: TunnelCapability[];
  state: TunnelState;
  health: TunnelHealth;
  metadata: Record<string, unknown>;
}
export interface TunnelConnection {
  id: string;
  tunnelId: string;
  state: TunnelState;
  establishedAt?: string;
  lastHealthCheck?: string;
  statistics: TunnelStatistics;
  routeContext?: unknown;
}
export interface TunnelPolicyConstraints {
  tunnelRequired?: boolean;
  proxyRequired?: boolean;
  vpnRequired?: boolean;
  approvedProviders?: string[];
  approvedProtocols?: TunnelProtocol[];
  allowedEndpoints?: string[];
  routingModes?: RoutingMode[];
  scopes?: TunnelScope[];
  killSwitchRequired?: boolean;
  dnsModes?: DnsMode[];
  requiredCapabilities?: TunnelCapability[];
}
export interface TunnelSelectionRequest {
  candidates: Tunnel[];
  policy: TunnelPolicyConstraints;
  routingMode: RoutingMode;
  scope: TunnelScope;
  requiredCapabilities: TunnelCapability[];
  securityProfile: SecurityProfile;
  routeContext?: unknown;
  connectivityContext?: unknown;
  dnsContext?: unknown;
}
export interface TunnelSelectionCandidate {
  tunnelId: string;
  eligible: boolean;
  rejectedReasons: string[];
  score: number;
  scoreComponents: Record<string, number>;
  explanation: string[];
}
export interface TunnelSelectionResult {
  candidates: TunnelSelectionCandidate[];
  rejectedCandidates: TunnelSelectionCandidate[];
  policyConstraints: TunnelPolicyConstraints;
  selectedTunnel?: Tunnel | undefined;
  reason: string;
}
export interface ProviderHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  checkedAt: string;
  latencyMs?: number;
}
export interface TunnelProvider {
  readonly id: string;
  readonly type: TunnelType;
  readonly protocol: TunnelProtocol;
  readonly capabilities: TunnelCapability[];
  readonly endpoints: Endpoint[];
  readonly supportedScopes: TunnelScope[];
  readonly supportedRoutingModes: RoutingMode[];
  healthCheck(tunnel?: Tunnel): Promise<TunnelHealth | ProviderHealth>;
  create(config: TunnelConfiguration): Promise<Tunnel>;
  connect(tunnel: Tunnel): Promise<TunnelConnection>;
  disconnect(connection: TunnelConnection): Promise<void>;
  destroy(tunnel: Tunnel): Promise<void>;
}
export interface PlatformTunnelAdapter {
  readonly platform: 'linux' | 'windows' | 'macos' | 'unknown';
  prepare(tunnel: Tunnel): Promise<void>;
  establish(tunnel: Tunnel): Promise<void>;
  cleanup(tunnel: Tunnel): Promise<void>;
  validateRouteContext(tunnel: Tunnel, routeContext?: unknown): Promise<boolean>;
}
export interface KillSwitch {
  enable(tunnelId: string): Promise<void>;
  disable(tunnelId: string): Promise<void>;
  status(tunnelId: string): Promise<'enabled' | 'disabled' | 'unsupported' | 'unknown'>;
}
export interface RecoveryTunnelActions {
  reconnectTunnel(tunnelId: string): Promise<TunnelConnection>;
  switchEndpoint(tunnelId: string, endpoint: Endpoint): Promise<TunnelConnection>;
  switchTunnel(fromTunnelId: string, toTunnelId: string): Promise<TunnelConnection>;
  switchProxy(fromProxyId: string, toProxyId: string): Promise<TunnelConnection>;
  disconnectTunnel(tunnelId: string): Promise<void>;
  revalidateTunnel(tunnelId: string): Promise<TunnelHealth>;
}

export class TunnelError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly classification: ErrorClassification,
    public readonly retryable = false,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
export const tunnelErrors = {
  configuration: (m: string, d: Record<string, unknown> = {}) =>
    new TunnelError(m, 'TunnelConfigurationError', 'configurationFailure', false, d),
  unsupported: (m: string, d: Record<string, unknown> = {}) =>
    new TunnelError(m, 'TunnelUnsupportedProtocol', 'configurationFailure', false, d),
  auth: (m: string, d: Record<string, unknown> = {}) =>
    new TunnelError(m, 'TunnelAuthenticationFailed', 'securityFailure', false, d),
  state: (m: string, d: Record<string, unknown> = {}) =>
    new TunnelError(m, 'TunnelStateConflict', 'nonRetryable', false, d),
  policy: (m: string, d: Record<string, unknown> = {}) =>
    new TunnelError(m, 'TunnelPolicyRejected', 'policyFailure', false, d),
  capability: (m: string, d: Record<string, unknown> = {}) =>
    new TunnelError(m, 'TunnelCapabilityMismatch', 'configurationFailure', false, d),
  resource: (m: string, d: Record<string, unknown> = {}) =>
    new TunnelError(m, 'TunnelResourceLimitExceeded', 'resourceFailure', true, d),
  dependency: (m: string, d: Record<string, unknown> = {}) =>
    new TunnelError(m, 'TunnelProviderUnavailable', 'dependencyFailure', true, d),
};

const allowedTransitions: Record<TunnelState, TunnelState[]> = {
  registered: ['configured', 'destroyed'],
  configured: ['preparing', 'destroyed'],
  preparing: ['connecting', 'failed', 'disconnecting'],
  connecting: ['authenticating', 'establishing', 'failed', 'disconnecting'],
  authenticating: ['establishing', 'failed', 'disconnecting'],
  establishing: ['connected', 'failed', 'disconnecting'],
  connected: ['degraded', 'disconnecting', 'recovering', 'failed'],
  degraded: ['connected', 'recovering', 'disconnecting', 'failed'],
  recovering: ['connecting', 'connected', 'failed', 'disconnecting'],
  disconnecting: ['disconnected', 'failed'],
  disconnected: ['preparing', 'destroyed'],
  failed: ['recovering', 'disconnecting', 'destroyed'],
  destroyed: [],
};
export function transitionTunnel(tunnel: Tunnel, next: TunnelState): Tunnel {
  if (!allowedTransitions[tunnel.state].includes(next))
    throw tunnelErrors.state(`Invalid tunnel state transition ${tunnel.state} -> ${next}`, {
      tunnelId: tunnel.id,
    });
  return { ...tunnel, state: next };
}

export function validateEndpoint(endpoint: Endpoint): void {
  if (!endpoint.host || endpoint.host.length > 253 || /\s/.test(endpoint.host))
    throw tunnelErrors.configuration('Invalid endpoint host');
  if (!Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535)
    throw tunnelErrors.configuration('Invalid endpoint port');
  if (
    ![
      'wireguard',
      'openvpn',
      'socks5',
      'http-connect',
      'https-proxy',
      'ssh',
      'quic',
      'custom',
    ].includes(endpoint.protocol)
  )
    throw tunnelErrors.unsupported('Unsupported endpoint protocol', {
      protocol: endpoint.protocol,
    });
}
export function validateTunnelConfiguration(config: TunnelConfiguration): void {
  validateEndpoint(config.endpoint);
  if (
    config.credentialRef ||
    ['credentials', 'certificate', 'key', 'token'].includes(config.authentication.type)
  ) {
    const refs = [
      config.credentialRef,
      config.authentication.credentialRef,
      config.authentication.certificateRef,
      config.authentication.keyRef,
      config.authentication.tokenRef,
    ].filter(Boolean);
    if (!refs.length)
      throw tunnelErrors.configuration(
        'Credential based authentication requires a credential reference',
      );
  }
  if (
    config.mtu.configuredMtu !== undefined &&
    (config.mtu.configuredMtu < 576 || config.mtu.configuredMtu > 9000)
  )
    throw tunnelErrors.configuration('MTU must be between 576 and 9000');
  if (
    config.keepalive.enabled &&
    (config.keepalive.intervalMs < 10_000 ||
      config.keepalive.timeoutMs < 1_000 ||
      config.keepalive.timeoutMs >= config.keepalive.intervalMs)
  )
    throw tunnelErrors.configuration('Invalid keepalive timing');
  if (config.timeoutMs < 1_000 || config.timeoutMs > 300_000)
    throw tunnelErrors.configuration('Invalid tunnel timeout');
  if (config.retryLimit < 0 || config.retryLimit > 10)
    throw tunnelErrors.configuration('Invalid retry limit');
  if (
    config.routingMode === 'splitTunnel' &&
    (!config.splitTunnel ||
      (!config.splitTunnel.includedDestinations.length &&
        !config.splitTunnel.excludedDestinations.length))
  )
    throw tunnelErrors.configuration('Split tunnel routing requires explicit destinations');
  if (config.securityProfile === 'strict') {
    if (config.authentication.type === 'none')
      throw tunnelErrors.auth('Strict security profile requires authentication');
    if (!config.capabilities.includes('healthCheck'))
      throw tunnelErrors.capability('Strict security profile requires health checks');
  }
}
export function redacted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redacted);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) =>
        /password|private|token|secret|credential|certificate|authorization/i.test(k)
          ? [k, '[REDACTED]']
          : [k, redacted(v)],
      ),
    ) as Record<string, unknown>;
  return value;
}

export class TunnelProviderRegistry {
  private providers = new Map<string, TunnelProvider>();
  constructor(private readonly maxProviders = 100) {}
  register(provider: TunnelProvider): void {
    if (this.providers.size >= this.maxProviders)
      throw tunnelErrors.resource('Provider limit exceeded');
    if (this.providers.has(provider.id))
      throw tunnelErrors.configuration('Duplicate tunnel provider', { providerId: provider.id });
    this.providers.set(provider.id, provider);
  }
  get(providerId: string): TunnelProvider | undefined {
    return this.providers.get(providerId);
  }
  list(): TunnelProvider[] {
    return [...this.providers.values()];
  }
  findByCapabilities(required: TunnelCapability[]): TunnelProvider[] {
    return this.list().filter((p) => required.every((c) => p.capabilities.includes(c)));
  }
  unregister(providerId: string): void {
    this.providers.delete(providerId);
  }
}

export class TunnelSelector {
  select(request: TunnelSelectionRequest): TunnelSelectionResult {
    const scored = request.candidates
      .map((t) => this.score(t, request))
      .sort((a, b) => b.score - a.score);
    const selectedCandidate = scored.find((c) => c.eligible);
    return {
      candidates: scored,
      rejectedCandidates: scored.filter((c) => !c.eligible),
      policyConstraints: request.policy,
      selectedTunnel: selectedCandidate
        ? request.candidates.find((t) => t.id === selectedCandidate.tunnelId)
        : undefined,
      reason: selectedCandidate
        ? `Selected ${selectedCandidate.tunnelId} with score ${selectedCandidate.score}`
        : 'No eligible tunnel satisfied policy, health, capability, routing, and security constraints',
    };
  }
  private score(tunnel: Tunnel, r: TunnelSelectionRequest): TunnelSelectionCandidate {
    const rejected: string[] = [];
    const p = r.policy;
    if (p.approvedProviders && !p.approvedProviders.includes(tunnel.providerId))
      rejected.push('provider-not-approved');
    if (p.approvedProtocols && !p.approvedProtocols.includes(tunnel.endpoint.protocol))
      rejected.push('protocol-not-approved');
    if (p.allowedEndpoints && !p.allowedEndpoints.includes(tunnel.endpoint.host))
      rejected.push('endpoint-not-allowed');
    if (p.routingModes && !p.routingModes.includes(r.routingMode))
      rejected.push('routing-mode-not-allowed');
    if (p.scopes && !p.scopes.includes(r.scope)) rejected.push('scope-not-allowed');
    for (const c of [...r.requiredCapabilities, ...(p.requiredCapabilities ?? [])])
      if (!tunnel.capabilities.includes(c)) rejected.push(`missing-${c}`);
    if (p.vpnRequired && tunnel.type !== 'vpn') rejected.push('vpn-required');
    if (p.proxyRequired && tunnel.type !== 'proxy') rejected.push('proxy-required');
    if (p.killSwitchRequired && !tunnel.capabilities.includes('killSwitch'))
      rejected.push('killswitch-required');
    if (r.securityProfile === 'strict' && tunnel.securityProfile !== 'strict')
      rejected.push('strict-security-required');
    const health =
      tunnel.health.status === 'healthy' ? 40 : tunnel.health.status === 'degraded' ? 15 : 0;
    const latency = Math.max(0, 20 - Math.floor((tunnel.health.latencyMs ?? 100) / 10));
    const security =
      tunnel.securityProfile === 'strict'
        ? 25
        : tunnel.securityProfile === 'secure'
          ? 20
          : tunnel.securityProfile === 'balanced'
            ? 12
            : 5;
    const capability = Math.min(15, tunnel.capabilities.length);
    return {
      tunnelId: tunnel.id,
      eligible: rejected.length === 0 && tunnel.state !== 'failed' && tunnel.state !== 'destroyed',
      rejectedReasons: rejected,
      score: rejected.length ? 0 : health + latency + security + capability,
      scoreComponents: { health, latency, security, capability },
      explanation: rejected.length
        ? rejected
        : ['eligible', `health=${tunnel.health.status}`, `security=${tunnel.securityProfile}`],
    };
  }
}

export class NoopLinuxTunnelAdapter implements PlatformTunnelAdapter {
  readonly platform = 'linux' as const;
  async prepare(): Promise<void> {}
  async establish(): Promise<void> {}
  async cleanup(): Promise<void> {}
  async validateRouteContext(): Promise<boolean> {
    return true;
  }
}
export class UnsupportedProtocolProvider implements TunnelProvider {
  readonly capabilities: TunnelCapability[];
  readonly endpoints: Endpoint[];
  readonly supportedScopes: TunnelScope[] = [];
  readonly supportedRoutingModes: RoutingMode[] = [];
  constructor(
    readonly id: string,
    readonly type: TunnelType,
    readonly protocol: TunnelProtocol,
    capabilities: TunnelCapability[] = [],
    endpoints: Endpoint[] = [],
  ) {
    this.capabilities = capabilities;
    this.endpoints = endpoints;
  }
  async healthCheck(): Promise<ProviderHealth> {
    return { status: 'unknown', checkedAt: now() };
  }
  async create(): Promise<Tunnel> {
    throw tunnelErrors.unsupported(
      `${this.protocol} provider is declared but not implemented in this repository`,
    );
  }
  async connect(): Promise<TunnelConnection> {
    throw tunnelErrors.unsupported(`${this.protocol} connect is unsupported`);
  }
  async disconnect(): Promise<void> {}
  async destroy(): Promise<void> {}
}

export class TunnelManager implements RecoveryTunnelActions {
  private tunnels = new Map<string, Tunnel>();
  private connections = new Map<string, TunnelConnection>();
  private locks = new Set<string>();
  private shuttingDown = false;
  constructor(
    private readonly registry: TunnelProviderRegistry,
    private readonly events?: TunnelEventBus,
    private readonly metrics?: TunnelMetrics,
    private readonly limits = { maxTunnels: 100, maxConcurrentConnects: 5 },
  ) {}
  async configure(providerId: string, config: TunnelConfiguration): Promise<Tunnel> {
    if (this.tunnels.size >= this.limits.maxTunnels)
      throw tunnelErrors.resource('Tunnel limit exceeded');
    validateTunnelConfiguration(config);
    const provider = this.registry.get(providerId);
    if (!provider) throw tunnelErrors.dependency('Tunnel provider unavailable', { providerId });
    const tunnel = await provider.create(config);
    this.tunnels.set(tunnel.id, tunnel);
    await this.publish('tunnel.configured', tunnel.id, {
      providerId,
      endpoint: config.endpoint.host,
      protocol: config.endpoint.protocol,
    });
    return tunnel;
  }
  getTunnel(tunnelId: string): Tunnel | undefined {
    return this.tunnels.get(tunnelId);
  }
  async connect(tunnelId: string): Promise<TunnelConnection> {
    if (this.shuttingDown) throw tunnelErrors.state('Tunnel manager is shutting down');
    if (this.locks.has(tunnelId)) throw tunnelErrors.state('Concurrent tunnel operation rejected');
    this.locks.add(tunnelId);
    const started = performance.now();
    this.metrics?.record('tunnel_connect_attempts_total', 1);
    try {
      let tunnel = this.mustTunnel(tunnelId);
      const provider = this.mustProvider(tunnel.providerId);
      tunnel = transitionTunnel(
        tunnel,
        tunnel.state === 'disconnected' ? 'preparing' : 'preparing',
      );
      this.tunnels.set(tunnelId, tunnel);
      await this.publish('tunnel.connect.started', tunnelId, {});
      tunnel = transitionTunnel(tunnel, 'connecting');
      this.tunnels.set(tunnelId, tunnel);
      const conn = await provider.connect(tunnel);
      tunnel = {
        ...tunnel,
        state: 'connected',
        health: { ...tunnel.health, status: 'healthy', checkedAt: now() },
      };
      this.tunnels.set(tunnelId, tunnel);
      this.connections.set(conn.id, conn);
      this.metrics?.record('tunnel_connect_success_total', 1);
      this.metrics?.record('tunnel_handshake_duration', performance.now() - started);
      await this.publish('tunnel.connected', tunnelId, { connectionId: conn.id });
      return conn;
    } catch (error) {
      this.metrics?.record('tunnel_connect_failure_total', 1);
      await this.publish('tunnel.connect.failed', tunnelId, {
        error: error instanceof TunnelError ? error.code : 'unknown',
      });
      throw error;
    } finally {
      this.locks.delete(tunnelId);
    }
  }
  async disconnectTunnel(tunnelId: string): Promise<void> {
    if (this.locks.has(tunnelId)) throw tunnelErrors.state('Concurrent tunnel operation rejected');
    this.locks.add(tunnelId);
    try {
      const tunnel = this.mustTunnel(tunnelId);
      const provider = this.mustProvider(tunnel.providerId);
      const connection = [...this.connections.values()].find((c) => c.tunnelId === tunnelId);
      this.tunnels.set(tunnelId, transitionTunnel(tunnel, 'disconnecting'));
      await this.publish('tunnel.disconnect.started', tunnelId, {});
      if (connection) await provider.disconnect(connection);
      for (const [cid, c] of this.connections)
        if (c.tunnelId === tunnelId) this.connections.delete(cid);
      this.tunnels.set(tunnelId, { ...this.mustTunnel(tunnelId), state: 'disconnected' });
      this.metrics?.record('tunnel_disconnect_total', 1);
      await this.publish('tunnel.disconnected', tunnelId, {});
    } finally {
      this.locks.delete(tunnelId);
    }
  }
  async reconnectTunnel(tunnelId: string): Promise<TunnelConnection> {
    this.metrics?.record('tunnel_reconnect_total', 1);
    await this.publish('tunnel.reconnect.requested', tunnelId, {});
    const t = this.mustTunnel(tunnelId);
    if (t.state === 'connected' || t.state === 'degraded') await this.disconnectTunnel(tunnelId);
    return this.connect(tunnelId);
  }
  async switchEndpoint(tunnelId: string, endpoint: Endpoint): Promise<TunnelConnection> {
    validateEndpoint(endpoint);
    const t = this.mustTunnel(tunnelId);
    this.tunnels.set(tunnelId, { ...t, endpoint, configuration: { ...t.configuration, endpoint } });
    await this.publish('tunnel.failover.requested', tunnelId, { endpoint: endpoint.host });
    const c = await this.reconnectTunnel(tunnelId);
    await this.publish('tunnel.failover.completed', tunnelId, { connectionId: c.id });
    return c;
  }
  async switchTunnel(_fromTunnelId: string, toTunnelId: string): Promise<TunnelConnection> {
    return this.reconnectTunnel(toTunnelId);
  }
  async switchProxy(_fromProxyId: string, toProxyId: string): Promise<TunnelConnection> {
    return this.reconnectTunnel(toProxyId);
  }
  async revalidateTunnel(tunnelId: string): Promise<TunnelHealth> {
    const t = this.mustTunnel(tunnelId);
    const h = (await this.mustProvider(t.providerId).healthCheck(t)) as TunnelHealth;
    this.tunnels.set(tunnelId, { ...t, health: h });
    await this.publish('tunnel.health.changed', tunnelId, {
      status: h.status,
      leakProtection: h.leakProtection,
    });
    return h;
  }
  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    await Promise.all(
      [...this.tunnels.values()]
        .filter((t) => t.state === 'connected' || t.state === 'degraded')
        .map((t) => this.disconnectTunnel(t.id)),
    );
  }
  private mustTunnel(tunnelId: string): Tunnel {
    const t = this.tunnels.get(tunnelId);
    if (!t) throw tunnelErrors.configuration('Unknown tunnel', { tunnelId });
    return t;
  }
  private mustProvider(providerId: string): TunnelProvider {
    const p = this.registry.get(providerId);
    if (!p) throw tunnelErrors.dependency('Tunnel provider unavailable', { providerId });
    return p;
  }
  private async publish(
    type: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.events?.publish({
      id: id('evt'),
      type,
      aggregateId,
      occurredAt: new Date(),
      payload: redacted(payload),
      metadata: { phase: '17' },
    });
  }
}

export function simulateTunnelSelection(request: TunnelSelectionRequest): TunnelSelectionResult {
  return new TunnelSelector().select(request);
}
export function simulateTunnelConnection(tunnel: Tunnel): Record<string, unknown> {
  return redacted({
    tunnelId: tunnel.id,
    dryRun: true,
    expectedRouteImpact: tunnel.configuration.routingMode,
    expectedDnsImpact: tunnel.configuration.dnsMode,
    securityImplications: tunnel.securityProfile,
    credentials: tunnel.configuration.credentialRef,
  }) as Record<string, unknown>;
}
export function simulateFailover(
  from: Tunnel,
  candidates: Tunnel[],
  policy: TunnelPolicyConstraints,
): TunnelSelectionResult {
  return simulateTunnelSelection({
    candidates: candidates.filter((t) => t.id !== from.id),
    policy,
    routingMode: from.configuration.routingMode,
    scope: from.configuration.scope,
    requiredCapabilities: from.configuration.capabilities,
    securityProfile: from.securityProfile,
  });
}
export const supportedProtocolStatus: Record<
  'WireGuard' | 'OpenVPN' | 'SOCKS5' | 'HTTP CONNECT' | 'HTTPS proxy',
  'implemented' | 'not implemented'
> = {
  WireGuard: 'not implemented',
  OpenVPN: 'not implemented',
  SOCKS5: 'not implemented',
  'HTTP CONNECT': 'not implemented',
  'HTTPS proxy': 'not implemented',
};
