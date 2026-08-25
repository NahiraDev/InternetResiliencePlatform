import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '@irp/config';
import type { Logger } from '@irp/logger';
import { createAllBuiltinProviders } from '@irp/dns/provider-registry';
import { type BenchmarkSample, type DnsProvider, type DnsQuestion } from '@irp/dns';

export interface Lifecycle {
  start(): Promise<void>;
  stop(): Promise<void>;
}
export interface Plugin extends Lifecycle {
  id: string;
  install?(container: Container): Promise<void> | void;
  initialize?(context: RuntimeContext): Promise<void> | void;
  unload?(): Promise<void> | void;
}
export interface RuntimeContext {
  config: AppConfig;
  logger: Logger;
  container: Container;
  events: EventBus;
}
export type RuntimeState = 'created' | 'starting' | 'running' | 'stopping' | 'stopped';
export type EventType = 'ProviderHealthy' | 'ProviderUnhealthy' | 'ProviderRecovered' | 'ConfigurationReloaded' | 'NetworkChanged' | 'ConnectivityLost' | 'ConnectivityRestored' | 'BenchmarkCompleted';
export interface DomainEvent<T = unknown> { id: string; type: string; aggregateId: string; occurredAt: Date; payload: T; metadata?: Record<string, string>; }
export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => Promise<void> | void;

export class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 500, public readonly details?: Record<string, unknown>) { super(message); }
}
export class ValidationAppError extends AppError { constructor(message: string, details?: Record<string, unknown>) { super('VALIDATION_ERROR', message, 400, details); } }
export class UnauthorizedAppError extends AppError { constructor(message = 'Authentication is required') { super('UNAUTHORIZED', message, 401); } }
export class ForbiddenAppError extends AppError { constructor(message = 'Insufficient permissions') { super('FORBIDDEN', message, 403); } }
export class ConflictAppError extends AppError { constructor(message: string, details?: Record<string, unknown>) { super('CONFLICT', message, 409, details); } }
export class NotFoundAppError extends AppError { constructor(resource: string) { super('NOT_FOUND', `${resource} was not found`, 404); } }
export const mapErrorToHttp = (error: unknown): { statusCode: number; body: { success: false; error: { code: string; message: string; details?: Record<string, unknown> } } } => error instanceof AppError ? { statusCode: error.statusCode, body: { success: false, error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } } } : { statusCode: 500, body: { success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } } };
export const createDomainEvent = <T>(type: string, aggregateId: string, payload: T): DomainEvent<T> => ({ id: randomUUID(), type, aggregateId, payload, occurredAt: new Date() });

export class Container {
  private readonly services = new Map<string, unknown>();
  register<T>(token: string, service: T): void { this.services.set(token, service); }
  resolve<T>(token: string): T { const service = this.services.get(token); if (service === undefined) throw new Error(`Service not registered: ${token}`); return service as T; }
  has(token: string): boolean { return this.services.has(token); }
}
export class EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly history: DomainEvent[] = [];
  subscribe<T extends DomainEvent>(type: T['type'] | '*', handler: EventHandler<T>): () => void { const set = this.handlers.get(type) ?? new Set<EventHandler>(); set.add(handler as EventHandler); this.handlers.set(type, set); return () => set.delete(handler as EventHandler); }
  async publish<T extends DomainEvent>(event: T): Promise<void>;
  async publish(type: string, payload: unknown): Promise<void>;
  async publish(eventOrType: DomainEvent | string, payload?: unknown): Promise<void> { const event = typeof eventOrType === 'string' ? createDomainEvent(eventOrType, eventOrType, payload) : eventOrType; this.history.push(event); const handlers = [...(this.handlers.get(event.type) ?? []), ...(this.handlers.get('*') ?? [])]; await Promise.all(handlers.map((handler) => handler(event))); }
  snapshot(): DomainEvent[] { return this.history.slice(-500); }
}
export interface JobOptions { id: string; intervalMs?: number; runAt?: Date; retry?: { attempts: number; baseDelayMs: number; maxDelayMs: number; jitterRatio: number }; }
export class Scheduler implements Lifecycle {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private stopping = false;
  constructor(private readonly logger?: Logger) {}
  schedule(options: JobOptions, job: () => Promise<void> | void): () => void { const run = async (attempt = 0): Promise<void> => { if (this.stopping) return; const started = Date.now(); try { await job(); this.logger?.debug('scheduler job completed', { id: options.id, latencyMs: Date.now() - started }); } catch (error) { const retry = options.retry; if (retry && attempt < retry.attempts) { const backoff = Math.min(retry.maxDelayMs, retry.baseDelayMs * 2 ** attempt); const jitter = backoff * retry.jitterRatio * Math.random(); this.timers.set(options.id, setTimeout(() => void run(attempt + 1), backoff + jitter)); return; } this.logger?.error('scheduler job failed', { id: options.id, error: error instanceof Error ? error.message : 'unknown' }); } if (options.intervalMs && !this.stopping) this.timers.set(options.id, setTimeout(() => void run(0), options.intervalMs)); }; const delay = Math.max(0, (options.runAt?.getTime() ?? Date.now()) - Date.now()); this.timers.set(options.id, setTimeout(() => void run(), delay)); return () => this.cancel(options.id); }
  cancel(id: string): void { const timer = this.timers.get(id); if (timer) clearTimeout(timer); this.timers.delete(id); }
  async start(): Promise<void> { this.stopping = false; }
  async stop(): Promise<void> { this.stopping = true; for (const id of [...this.timers.keys()]) this.cancel(id); }
}
export interface RollingStats { count: number; successes: number; failures: number; packetLoss: number; timeoutRate: number; jitterMs: number; averageResponseTimeMs: number; availability: number; successRatio: number; lastLatencyMs?: number | undefined; }
export class BenchmarkEngine {
  private readonly samples = new Map<string, BenchmarkSample[]>();
  constructor(private readonly events?: EventBus, private readonly maxSamples = 200) {}
  async run(providers: DnsProvider[], question: DnsQuestion = { name: 'example.com', recordType: 'A' }): Promise<BenchmarkSample[]> { const results = await Promise.all(providers.map(async (provider) => { const started = performance.now(); try { await provider.resolve(question, { timeoutMs: provider.config.timeoutMs }); return { providerId: provider.id, latencyMs: performance.now() - started, success: true, timedOut: false, timestamp: new Date().toISOString() }; } catch (error) { return { providerId: provider.id, latencyMs: performance.now() - started, success: false, timedOut: error instanceof Error && error.message.toLowerCase().includes('timeout'), error: error instanceof Error ? error.message : 'unknown', timestamp: new Date().toISOString() }; } })); for (const sample of results) this.record(sample); await this.events?.publish('BenchmarkCompleted', { results }); return results; }
  record(sample: BenchmarkSample): void { const list = this.samples.get(sample.providerId) ?? []; list.push(sample); this.samples.set(sample.providerId, list.slice(-this.maxSamples)); }
  stats(providerId: string): RollingStats { const list = this.samples.get(providerId) ?? []; const successes = list.filter((s) => s.success); const latencies = successes.map((s) => s.latencyMs); const average = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1); const jitter = latencies.reduce((a, b) => a + Math.abs(b - average), 0) / (latencies.length || 1); return { count: list.length, successes: successes.length, failures: list.length - successes.length, packetLoss: list.length ? (list.length - successes.length) / list.length : 0, timeoutRate: list.length ? list.filter((s) => s.timedOut).length / list.length : 0, jitterMs: jitter, averageResponseTimeMs: average, availability: list.length ? successes.length / list.length : 0, successRatio: list.length ? successes.length / list.length : 0, lastLatencyMs: latencies.at(-1) }; }
  snapshot(): Record<string, RollingStats> { return Object.fromEntries([...this.samples.keys()].map((id) => [id, this.stats(id)])); }
}
export class HealthScorer {
  score(provider: DnsProvider, stats: RollingStats): number { const latency = Math.max(0, 40 - Math.min(40, stats.averageResponseTimeMs / 10)); const reliability = (1 - stats.packetLoss) * 25 + (1 - stats.timeoutRate) * 15 + stats.successRatio * 10; const support = (provider.supportsDNSSEC() ? 4 : 0) + (provider.supportsDoH() ? 3 : 0) + (provider.supportsDoT() ? 3 : 0); const stability = Math.max(0, 10 - stats.jitterMs / 20); return Math.round(Math.max(0, Math.min(100, latency + reliability + support + stability))); }
}
export class Cache<T = unknown> {
  private readonly values = new Map<string, { value: T; expiresAt: number }>();
  set(key: string, value: T, ttlMs: number): void { this.values.set(key, { value, expiresAt: Date.now() + ttlMs }); }
  get(key: string): T | null { const item = this.values.get(key); if (!item) return null; if (item.expiresAt <= Date.now()) { this.values.delete(key); return null; } return item.value; }
  delete(key: string): void { this.values.delete(key); }
  size(): number { return this.values.size; }
}
export class Application implements Lifecycle {
  private readonly plugins: Plugin[] = [];
  public readonly events = new EventBus();
  public readonly scheduler: Scheduler;
  /** All curated + verified regional/global providers participate in benchmarking and scoring. */
  public readonly providers = createAllBuiltinProviders();
  public readonly benchmark = new BenchmarkEngine(this.events);
  public readonly scorer = new HealthScorer();
  public state: RuntimeState = 'created';
  constructor(public config: AppConfig, public readonly logger: Logger, public readonly container = new Container()) { this.scheduler = new Scheduler(logger); container.register('events', this.events); container.register('scheduler', this.scheduler); container.register('providers', this.providers); container.register('benchmark', this.benchmark); }
  use(plugin: Plugin): void { this.plugins.push(plugin); }
  async start(): Promise<void> { if (this.state === 'running' || this.state === 'starting') return; this.state = 'starting'; await this.scheduler.start(); for (const plugin of this.plugins) { await plugin.install?.(this.container); await plugin.initialize?.({ config: this.config, logger: this.logger, container: this.container, events: this.events }); await plugin.start(); } this.state = 'running'; this.logger.info('application started', { plugins: this.plugins.map((p) => p.id) }); }
  async stop(): Promise<void> { if (this.state === 'stopped' || this.state === 'stopping') return; this.state = 'stopping'; await this.scheduler.stop(); for (const plugin of [...this.plugins].reverse()) { await plugin.stop(); await plugin.unload?.(); } this.state = 'stopped'; this.logger.info('application stopped'); }
  async reload(config: AppConfig): Promise<void> { this.config = config; await this.events.publish('ConfigurationReloaded', { environment: config.app.environment }); }
}
