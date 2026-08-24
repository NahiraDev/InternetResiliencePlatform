import type { GatewayAddressFamily, GatewayEndpoint, GatewayId } from './index.js';

/** Provider-neutral tunnel protocols supported by the abstraction layer. */
export type TunnelProtocol = string;
export type TunnelTransport = string;
export type TunnelId = string;
export type TunnelLifecycle = 'disconnected' | 'connecting' | 'connected' | 'degraded' | 'disconnecting' | 'failed';

export interface TunnelTarget {
  gatewayId: GatewayId;
  endpoint: GatewayEndpoint;
  protocol: TunnelProtocol;
  transport: TunnelTransport;
  addressFamily: GatewayAddressFamily;
}

export interface TunnelCapabilities {
  protocols: TunnelProtocol[];
  transports: TunnelTransport[];
  addressFamilies: GatewayAddressFamily[];
  supportsReconnect: boolean;
  supportsHealthCheck: boolean;
}

export interface TunnelHealth {
  reachable: boolean;
  latencyMs?: number;
  packetLossPercent?: number;
  checkedAt: string;
}

export interface TunnelSession {
  id: TunnelId;
  target: TunnelTarget;
  lifecycle: TunnelLifecycle;
  createdAt: string;
  updatedAt: string;
  connectedAt?: string;
  disconnectedAt?: string;
  failureReason?: string;
  health?: TunnelHealth;
}

export interface TunnelConnectRequest {
  target: TunnelTarget;
  timeoutMs: number;
  /** Opaque provider-owned connection context. The abstraction never persists or inspects secrets. */
  context?: unknown;
}

export interface TunnelProvider {
  readonly id: string;
  capabilities(): TunnelCapabilities;
  connect(request: TunnelConnectRequest): Promise<TunnelProviderConnection>;
  disconnect(connection: TunnelProviderConnection, timeoutMs: number): Promise<void>;
  healthCheck?(connection: TunnelProviderConnection, timeoutMs: number): Promise<TunnelHealth>;
}

export interface TunnelProviderConnection {
  readonly id: string;
}

export interface TunnelManager {
  get(id: TunnelId): TunnelSession | undefined;
  list(): TunnelSession[];
  connect(request: TunnelConnectRequest): Promise<TunnelSession>;
  disconnect(id: TunnelId, timeoutMs: number): Promise<TunnelSession>;
  reconnect(id: TunnelId, timeoutMs: number): Promise<TunnelSession>;
  healthCheck(id: TunnelId, timeoutMs: number): Promise<TunnelSession>;
}

const lifecycleTransitions: Record<TunnelLifecycle, TunnelLifecycle[]> = {
  disconnected: ['connecting'],
  connecting: ['connected', 'failed', 'disconnecting'],
  connected: ['degraded', 'disconnecting', 'failed'],
  degraded: ['connected', 'disconnecting', 'failed'],
  disconnecting: ['disconnected', 'failed'],
  failed: ['connecting', 'disconnecting'],
};

const clone = <T>(value: T): T => structuredClone(value);

function assertTimeout(timeoutMs: number): void {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be a positive integer');
}

function assertHealth(health: TunnelHealth): void {
  const checkedAt = Date.parse(health.checkedAt);
  if (!Number.isFinite(checkedAt)) throw new Error('health checkedAt must be a valid ISO timestamp');
  if (health.latencyMs !== undefined && (!Number.isFinite(health.latencyMs) || health.latencyMs < 0)) throw new Error('health latencyMs must be non-negative');
  if (health.packetLossPercent !== undefined && (!Number.isFinite(health.packetLossPercent) || health.packetLossPercent < 0 || health.packetLossPercent > 100)) throw new Error('health packetLossPercent must be between 0 and 100');
}

function assertTarget(target: TunnelTarget): void {
  if (!target.gatewayId.trim()) throw new Error('tunnel gatewayId is required');
  if (!target.protocol.trim()) throw new Error('tunnel protocol is required');
  if (!target.transport.trim()) throw new Error('tunnel transport is required');
  if (!target.endpoint.host.trim()) throw new Error('tunnel endpoint host is required');
  if (!Number.isInteger(target.endpoint.port) || target.endpoint.port < 1 || target.endpoint.port > 65535) throw new Error('tunnel endpoint port must be an integer between 1 and 65535');
  if (!target.addressFamily) throw new Error('tunnel addressFamily is required');
}

function transition(session: TunnelSession, lifecycle: TunnelLifecycle, now = new Date().toISOString(), failureReason?: string): TunnelSession {
  if (session.lifecycle !== lifecycle && !lifecycleTransitions[session.lifecycle].includes(lifecycle)) throw new Error(`invalid tunnel lifecycle transition: ${session.lifecycle} -> ${lifecycle}`);
  const next: TunnelSession = { ...session, lifecycle, updatedAt: now };
  if (lifecycle === 'connected') {
    next.connectedAt = now;
    delete next.failureReason;
  }
  if (lifecycle === 'disconnected') next.disconnectedAt = now;
  if (failureReason !== undefined) next.failureReason = failureReason;
  return next;
}

export class InMemoryTunnelManager implements TunnelManager {
  private readonly sessions = new Map<TunnelId, TunnelSession>();
  private readonly connections = new Map<TunnelId, TunnelProviderConnection>();

  constructor(private readonly provider: TunnelProvider) {
    if (!provider.id.trim()) throw new Error('tunnel provider id is required');
  }

  get(id: TunnelId): TunnelSession | undefined {
    const session = this.sessions.get(id);
    return session ? clone(session) : undefined;
  }

  list(): TunnelSession[] {
    return [...this.sessions.values()].map(clone);
  }

  async connect(request: TunnelConnectRequest): Promise<TunnelSession> {
    assertTarget(request.target);
    assertTimeout(request.timeoutMs);
    const capabilities = this.provider.capabilities();
    if (!capabilities.protocols.includes(request.target.protocol)) throw new Error(`provider does not support tunnel protocol ${request.target.protocol}`);
    if (!capabilities.transports.includes(request.target.transport)) throw new Error(`provider does not support tunnel transport ${request.target.transport}`);
    if (!capabilities.addressFamilies.includes(request.target.addressFamily)) throw new Error(`provider does not support address family ${request.target.addressFamily}`);

    const id = `${this.provider.id}:${request.target.gatewayId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const now = new Date().toISOString();
    let session: TunnelSession = { id, target: clone(request.target), lifecycle: 'disconnected', createdAt: now, updatedAt: now };
    session = transition(session, 'connecting', now);
    this.sessions.set(id, session);

    try {
      const connection = await withTimeout(this.provider.connect({ ...request, target: clone(request.target) }), request.timeoutMs, 'tunnel connect timed out');
      this.connections.set(id, connection);
      session = transition(this.require(id), 'connected');
      this.sessions.set(id, session);
      return clone(session);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'tunnel connection failed';
      session = transition(this.require(id), 'failed', new Date().toISOString(), reason);
      this.sessions.set(id, session);
      throw error;
    }
  }

  async disconnect(id: TunnelId, timeoutMs: number): Promise<TunnelSession> {
    assertTimeout(timeoutMs);
    const current = this.require(id);
    if (current.lifecycle === 'disconnected') return clone(current);
    if (current.lifecycle === 'connecting') throw new Error('cannot disconnect a tunnel while it is connecting');
    const connection = this.connections.get(id);
    if (!connection) {
      const disconnected = transition(current, 'disconnected');
      this.sessions.set(id, disconnected);
      return clone(disconnected);
    }
    this.sessions.set(id, transition(current, 'disconnecting'));
    try {
      await withTimeout(this.provider.disconnect(connection, timeoutMs), timeoutMs, 'tunnel disconnect timed out');
      this.connections.delete(id);
      const disconnected = transition(this.require(id), 'disconnected');
      this.sessions.set(id, disconnected);
      return clone(disconnected);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'tunnel disconnect failed';
      const failed = transition(this.require(id), 'failed', new Date().toISOString(), reason);
      this.sessions.set(id, failed);
      throw error;
    }
  }

  async reconnect(id: TunnelId, timeoutMs: number): Promise<TunnelSession> {
    assertTimeout(timeoutMs);
    const current = this.require(id);
    if (current.lifecycle === 'connecting' || current.lifecycle === 'disconnecting') throw new Error('cannot reconnect while tunnel transition is in progress');
    if (!this.provider.capabilities().supportsReconnect) throw new Error('provider does not support reconnect');
    if (this.connections.has(id)) await this.disconnect(id, timeoutMs);
    return this.connect({ target: current.target, timeoutMs });
  }

  async healthCheck(id: TunnelId, timeoutMs: number): Promise<TunnelSession> {
    assertTimeout(timeoutMs);
    const current = this.require(id);
    if (current.lifecycle !== 'connected' && current.lifecycle !== 'degraded') throw new Error('health check requires a connected tunnel');
    const connection = this.connections.get(id);
    if (!connection || !this.provider.healthCheck || !this.provider.capabilities().supportsHealthCheck) throw new Error('provider does not expose tunnel health checks');
    const health = await withTimeout(this.provider.healthCheck(connection, timeoutMs), timeoutMs, 'tunnel health check timed out');
    assertHealth(health);
    const lifecycle: TunnelLifecycle = health.reachable ? 'connected' : 'degraded';
    const updated = transition(current, lifecycle);
    const session: TunnelSession = { ...updated, health: clone(health), updatedAt: new Date().toISOString() };
    this.sessions.set(id, session);
    return clone(session);
  }

  private require(id: TunnelId): TunnelSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`tunnel ${id} not found`);
    return session;
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); })]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
