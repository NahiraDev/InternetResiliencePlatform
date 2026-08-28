import { randomUUID } from 'node:crypto';
import {
  type KillSwitch,
  type PlatformTunnelAdapter,
  type Tunnel,
  type TunnelConnection,
  type TunnelConfiguration,
  type TunnelEventBus,
  type TunnelHealth,
  type TunnelMetrics,
  type TunnelProvider,
  type TunnelProviderRegistry,
  TunnelError,
  tunnelErrors,
  transitionTunnel,
  validateEndpoint,
  validateTunnelConfiguration,
} from './index.js';

export interface TunnelLifecycleOptions {
  maxConnectAttempts?: number;
  connectTimeoutMs?: number;
  disconnectTimeoutMs?: number;
  healthTimeoutMs?: number;
  requireHealth?: boolean;
  requireRouteValidation?: boolean;
  killSwitchRequired?: boolean;
}

export interface TunnelLifecycleResult {
  tunnel: Tunnel;
  connection: TunnelConnection;
  health: TunnelHealth;
  attempts: number;
}

const DEFAULTS: Required<TunnelLifecycleOptions> = {
  maxConnectAttempts: 3,
  connectTimeoutMs: 60_000,
  disconnectTimeoutMs: 30_000,
  healthTimeoutMs: 15_000,
  requireHealth: true,
  requireRouteValidation: true,
  killSwitchRequired: false,
};

function timeoutError(operation: string, timeoutMs: number): TunnelError {
  return new TunnelError(`${operation} timed out after ${timeoutMs}ms`, 'TunnelLifecycleTimeout', 'retryable', true, { operation, timeoutMs });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000) throw tunnelErrors.configuration(`${operation} timeout must be at least 1000ms`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(timeoutError(operation, timeoutMs)), timeoutMs); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isHealthy(health: TunnelHealth): boolean {
  return health.status === 'healthy' && health.connectivity && health.handshake && health.authenticated;
}

export class AutomatedTunnelLifecycle {
  private readonly options: Required<TunnelLifecycleOptions>;
  private readonly locks = new Set<string>();
  private readonly connections = new Map<string, TunnelConnection>();
  private readonly tunnels = new Map<string, Tunnel>();

  constructor(
    private readonly registry: TunnelProviderRegistry,
    private readonly adapter: PlatformTunnelAdapter,
    private readonly killSwitch?: KillSwitch,
    private readonly events?: TunnelEventBus,
    private readonly metrics?: TunnelMetrics,
    options: TunnelLifecycleOptions = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
    if (this.options.maxConnectAttempts < 1 || this.options.maxConnectAttempts > 10) throw tunnelErrors.configuration('maxConnectAttempts must be between 1 and 10');
  }

  getTunnel(tunnelId: string): Tunnel | undefined { return this.tunnels.get(tunnelId); }
  getConnection(tunnelId: string): TunnelConnection | undefined { return [...this.connections.values()].find((connection) => connection.tunnelId === tunnelId); }

  async establish(providerId: string, config: TunnelConfiguration): Promise<TunnelLifecycleResult> {
    validateTunnelConfiguration(config);
    const provider = this.requireProvider(providerId);
    this.assertProviderCompatibility(provider, config);
    const tunnel = await provider.create(config);
    this.tunnels.set(tunnel.id, tunnel);
    await this.emit('tunnel.lifecycle.configured', tunnel.id, { providerId });
    try { return await this.connect(tunnel.id); }
    catch (error) { await this.rollbackCreatedTunnel(tunnel, provider); throw error; }
  }

  async connect(tunnelId: string): Promise<TunnelLifecycleResult> {
    this.lock(tunnelId);
    const startedAt = Date.now();
    let killSwitchEnabled = false;
    try {
      let tunnel = this.requireTunnel(tunnelId);
      const provider = this.requireProvider(tunnel.providerId);
      if (this.options.killSwitchRequired && !tunnel.capabilities.includes('killSwitch')) throw tunnelErrors.policy('Lifecycle requires a kill switch but the tunnel does not advertise one', { tunnelId });
      if (this.options.requireRouteValidation) {
        const routeValid = await withTimeout(this.adapter.validateRouteContext(tunnel, tunnel.configuration.metadata?.routeContext), this.options.healthTimeoutMs, 'route validation');
        if (!routeValid) throw tunnelErrors.policy('Tunnel route context was rejected by the platform adapter', { tunnelId });
      }
      if (tunnel.state === 'failed') tunnel = transitionTunnel(tunnel, 'recovering');
      if (tunnel.state === 'recovering') tunnel = transitionTunnel(tunnel, 'connecting');
      else if (tunnel.state === 'disconnected' || tunnel.state === 'configured') tunnel = transitionTunnel(tunnel, 'preparing');
      else if (tunnel.state !== 'preparing') throw tunnelErrors.state(`Cannot connect tunnel in state ${tunnel.state}`, { tunnelId });
      this.tunnels.set(tunnel.id, tunnel);
      await this.adapter.prepare(tunnel);
      if (this.requiresKillSwitch(tunnel)) {
        if (!this.killSwitch) throw tunnelErrors.policy('A kill switch is required but no kill-switch implementation is configured');
        await withTimeout(this.killSwitch.enable(tunnel.id), this.options.healthTimeoutMs, 'kill switch enable');
        killSwitchEnabled = true;
      }

      let lastError: unknown;
      for (let attempt = 1; attempt <= this.options.maxConnectAttempts; attempt += 1) {
        try {
          tunnel = this.requireTunnel(tunnelId);
          if (tunnel.state === 'preparing') tunnel = transitionTunnel(tunnel, 'connecting');
          else if (tunnel.state === 'recovering') tunnel = transitionTunnel(tunnel, 'connecting');
          else if (tunnel.state !== 'connecting') throw tunnelErrors.state(`Cannot retry tunnel from state ${tunnel.state}`, { tunnelId });
          this.tunnels.set(tunnel.id, tunnel);
          await this.emit('tunnel.lifecycle.connecting', tunnel.id, { attempt });
          const connection = await withTimeout(provider.connect(tunnel), this.options.connectTimeoutMs, 'tunnel connect');
          this.connections.set(connection.id, connection);
          tunnel = { ...this.requireTunnel(tunnelId), state: 'establishing' };
          this.tunnels.set(tunnel.id, tunnel);
          await this.adapter.establish(tunnel);
          const health = await withTimeout(provider.healthCheck(tunnel), this.options.healthTimeoutMs, 'tunnel health check');
          if (this.options.requireHealth && !isHealthy(health as TunnelHealth)) throw tunnelErrors.dependency('Tunnel connected but failed post-connect health verification', { tunnelId, healthStatus: health.status });
          tunnel = { ...this.requireTunnel(tunnelId), state: 'connected', health: health as TunnelHealth };
          this.tunnels.set(tunnel.id, tunnel);
          if (killSwitchEnabled) {
            await withTimeout(this.killSwitch!.disable(tunnel.id), this.options.healthTimeoutMs, 'kill switch disable');
            killSwitchEnabled = false;
          }
          this.metrics?.record('tunnel_lifecycle_connect_success_total', 1, { provider: provider.id });
          this.metrics?.record('tunnel_lifecycle_connect_duration_ms', Date.now() - startedAt, { provider: provider.id });
          await this.emit('tunnel.lifecycle.connected', tunnel.id, { connectionId: connection.id, attempt });
          return { tunnel, connection, health: health as TunnelHealth, attempts: attempt };
        } catch (error) {
          lastError = error;
          this.metrics?.record('tunnel_lifecycle_connect_retry_total', 1, { provider: provider.id });
          await this.emit('tunnel.lifecycle.connect_failed', tunnelId, { attempt, retryable: error instanceof TunnelError ? error.retryable : true, error: error instanceof TunnelError ? error.code : 'unknown' });
          if (attempt >= this.options.maxConnectAttempts || (error instanceof TunnelError && !error.retryable)) break;
          await this.prepareRetry(tunnelId, provider);
        }
      }
      throw lastError instanceof Error ? lastError : tunnelErrors.dependency('Tunnel connection failed');
    } catch (error) {
      this.metrics?.record('tunnel_lifecycle_connect_failure_total', 1);
      await this.markFailed(tunnelId, error);
      if (killSwitchEnabled && this.killSwitch) {
        try { await withTimeout(this.killSwitch.enable(tunnelId), this.options.healthTimeoutMs, 'kill switch recovery enable'); }
        catch { await this.emit('tunnel.lifecycle.safety_action_failed', tunnelId, { action: 'enable-kill-switch' }); }
      }
      throw error;
    } finally { this.unlock(tunnelId); }
  }

  async disconnect(tunnelId: string, destroy = false): Promise<void> {
    this.lock(tunnelId);
    try {
      const tunnel = this.requireTunnel(tunnelId);
      const provider = this.requireProvider(tunnel.providerId);
      const connection = this.getConnection(tunnelId);
      if (this.requiresKillSwitch(tunnel) && this.killSwitch) await withTimeout(this.killSwitch.enable(tunnelId), this.options.healthTimeoutMs, 'kill switch enable before disconnect');
      const disconnecting = this.toDisconnecting(tunnel);
      this.tunnels.set(tunnelId, disconnecting);
      await this.emit('tunnel.lifecycle.disconnecting', tunnelId, {});
      if (connection) {
        await withTimeout(provider.disconnect(connection, this.options.disconnectTimeoutMs), this.options.disconnectTimeoutMs, 'tunnel disconnect');
        this.connections.delete(connection.id);
      }
      await this.adapter.cleanup(tunnel);
      const disconnected = { ...this.requireTunnel(tunnelId), state: 'disconnected' as const };
      this.tunnels.set(tunnelId, disconnected);
      await this.emit('tunnel.lifecycle.disconnected', tunnelId, {});
      if (destroy) {
        await provider.destroy(disconnected);
        this.tunnels.set(tunnelId, { ...disconnected, state: 'destroyed' });
        await this.emit('tunnel.lifecycle.destroyed', tunnelId, {});
      }
    } finally { this.unlock(tunnelId); }
  }

  async reconnect(tunnelId: string): Promise<TunnelLifecycleResult> {
    const current = this.requireTunnel(tunnelId);
    if (current.state === 'connected' || current.state === 'degraded') await this.disconnect(tunnelId);
    return this.connect(tunnelId);
  }

  async rotate(tunnelId: string, changes: Pick<Partial<TunnelConfiguration>, 'credentialRef' | 'authentication' | 'endpoint'> = {}): Promise<TunnelLifecycleResult> {
    if (changes.endpoint) validateEndpoint(changes.endpoint);
    this.lock(tunnelId);
    try {
      const current = this.requireTunnel(tunnelId);
      const configuration: TunnelConfiguration = {
        ...current.configuration,
        ...(changes.endpoint ? { endpoint: changes.endpoint } : {}),
        ...(changes.authentication ? { authentication: changes.authentication } : {}),
        ...(changes.credentialRef !== undefined ? { credentialRef: changes.credentialRef } : {}),
      };
      validateTunnelConfiguration(configuration);
      this.tunnels.set(tunnelId, { ...current, endpoint: configuration.endpoint, configuration });
      await this.emit('tunnel.lifecycle.rotation_requested', tunnelId, { endpointChanged: Boolean(changes.endpoint), credentialChanged: Boolean(changes.credentialRef || changes.authentication) });
    } finally { this.unlock(tunnelId); }
    return this.reconnect(tunnelId);
  }

  async shutdown(): Promise<void> {
    const active = [...this.tunnels.values()].filter((tunnel) => tunnel.state === 'connected' || tunnel.state === 'degraded');
    for (const tunnel of active) { try { await this.disconnect(tunnel.id); } catch { await this.emit('tunnel.lifecycle.shutdown_failed', tunnel.id, {}); } }
  }

  private requiresKillSwitch(tunnel: Tunnel): boolean { return this.options.killSwitchRequired || tunnel.configuration.securityProfile === 'strict' || tunnel.configuration.routingMode === 'fullTunnel'; }

  private assertProviderCompatibility(provider: TunnelProvider, config: TunnelConfiguration): void {
    if (provider.protocol !== config.endpoint.protocol) throw tunnelErrors.configuration('Provider protocol does not match tunnel endpoint protocol', { providerId: provider.id, providerProtocol: provider.protocol, endpointProtocol: config.endpoint.protocol });
    if (!provider.supportedScopes.includes(config.scope)) throw tunnelErrors.capability('Provider does not support the requested tunnel scope', { providerId: provider.id, scope: config.scope });
    if (!provider.supportedRoutingModes.includes(config.routingMode)) throw tunnelErrors.capability('Provider does not support the requested routing mode', { providerId: provider.id, routingMode: config.routingMode });
    for (const capability of config.capabilities) if (!provider.capabilities.includes(capability)) throw tunnelErrors.capability(`Provider does not support required capability ${capability}`, { providerId: provider.id, capability });
  }

  private async prepareRetry(tunnelId: string, provider: TunnelProvider): Promise<void> {
    const tunnel = this.requireTunnel(tunnelId);
    const connection = this.getConnection(tunnelId);
    if (connection) {
      try { await withTimeout(provider.disconnect(connection, this.options.disconnectTimeoutMs), this.options.disconnectTimeoutMs, 'retry disconnect'); }
      finally { this.connections.delete(connection.id); }
    }
    await this.adapter.cleanup(tunnel);
    this.tunnels.set(tunnelId, transitionTunnel({ ...tunnel, state: 'failed' }, 'recovering'));
  }

  private async rollbackCreatedTunnel(tunnel: Tunnel, provider: TunnelProvider): Promise<void> {
    try { const connection = this.getConnection(tunnel.id); if (connection) { await provider.disconnect(connection, this.options.disconnectTimeoutMs); this.connections.delete(connection.id); } await this.adapter.cleanup(tunnel); await provider.destroy(tunnel); this.tunnels.delete(tunnel.id); }
    catch { await this.emit('tunnel.lifecycle.rollback_failed', tunnel.id, {}); }
  }

  private markFailed(tunnelId: string, error: unknown): void {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel || tunnel.state === 'destroyed') return;
    const failed = { ...tunnel, state: 'failed' as const };
    this.tunnels.set(tunnelId, failed);
    void this.emit('tunnel.lifecycle.failed', tunnelId, { error: error instanceof TunnelError ? error.code : 'unknown' });
  }

  private toDisconnecting(tunnel: Tunnel): Tunnel { return tunnel.state === 'disconnecting' ? tunnel : transitionTunnel(tunnel, 'disconnecting'); }
  private requireTunnel(tunnelId: string): Tunnel { const tunnel = this.tunnels.get(tunnelId); if (!tunnel) throw tunnelErrors.configuration('Tunnel not found', { tunnelId }); return tunnel; }
  private requireProvider(providerId: string): TunnelProvider { const provider = this.registry.get(providerId); if (!provider) throw tunnelErrors.dependency('Tunnel provider not found', { providerId }); return provider; }
  private lock(tunnelId: string): void { if (this.locks.has(tunnelId)) throw tunnelErrors.state('Concurrent tunnel lifecycle operation rejected', { tunnelId }); this.locks.add(tunnelId); }
  private unlock(tunnelId: string): void { this.locks.delete(tunnelId); }
  private async emit(type: string, aggregateId: string, payload: unknown): Promise<void> { if (!this.events) return; await this.events.publish({ id: randomUUID(), type, aggregateId, occurredAt: new Date(), payload }); }
}
