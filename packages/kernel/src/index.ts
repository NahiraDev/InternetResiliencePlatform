import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

export type KernelState =
  'created' | 'bootstrapping' | 'running' | 'draining' | 'stopped' | 'failed';
export type ServiceState =
  'registered' | 'starting' | 'healthy' | 'degraded' | 'unhealthy' | 'stopped';
export type LifecycleState<T extends string> = T;
export type Capability = `${string}.${string}`;
export const KernelCapabilities = [
  'dns.resolve', 'dns.modify', 'vpn.connect', 'vpn.disconnect', 'proxy.forward',
  'network.capture', 'network.route', 'network.inspect', 'storage.read', 'storage.write',
  'storage.encrypt', 'crypto.sign', 'crypto.verify', 'telemetry.publish', 'plugin.load',
  'plugin.install', 'scheduler.execute', 'workflow.run',
] as const;
export type BuiltinCapability = (typeof KernelCapabilities)[number];

export interface Principal { id: string; capabilities: readonly Capability[]; metadata?: Record<string, string>; }
export interface KernelLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}
export const silentLogger: KernelLogger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
export interface KernelContext {
  kernelId: string; principal: Principal; startedAt: Date; signal: AbortSignal; logger: KernelLogger;
  capabilities: CapabilityAuthorizer; registry: KernelRegistry; bus: MessageBus; resources: ResourceManager;
  features: FeatureFlags; config: ConfigurationStore;
}
export interface OperationOptions { principal?: Principal; signal?: AbortSignal; timeoutMs?: number; priority?: EventPriority; persist?: boolean; }
export interface ContractOperation<I = unknown, O = unknown> { capability: Capability; execute(input: I, context: KernelContext): Promise<O> | O; }
export interface KernelContract { readonly namespace: ContractNamespace; readonly version: string; readonly operations: Readonly<Record<string, ContractOperation>>; }
export type ContractNamespace = 'dns' | 'vpn' | 'proxy' | 'tunnel' | 'routing' | 'storage' | 'security' | 'telemetry' | 'metrics' | 'plugin' | 'ai' | 'notifications' | 'configuration' | 'health' | 'scheduler';
export type ContractMap = Partial<Record<ContractNamespace, KernelContract>>;

export class KernelError extends Error {
  constructor(public readonly code: string, message: string, public readonly details: Record<string, unknown> = {}) { super(message); }
}
export class CapabilityError extends KernelError { constructor(capability: Capability) { super('CAPABILITY_DENIED', `Missing capability: ${capability}`, { capability }); } }
export class ServiceNotFoundError extends KernelError { constructor(token: string) { super('SERVICE_NOT_FOUND', `Service is not registered: ${token}`, { token }); } }

export class CapabilityAuthorizer {
  assert(principal: Principal, capability: Capability): void {
    if (!principal.capabilities.includes(capability) && !principal.capabilities.includes('*.*')) throw new CapabilityError(capability);
  }
  can(principal: Principal, capability: Capability): boolean { try { this.assert(principal, capability); return true; } catch { return false; } }
}

export type ServiceLifetime = 'singleton' | 'scoped' | 'transient';
export type ServiceFactory<T> = (scope: ServiceScope) => T | Promise<T>;
export interface ServiceDescriptor<T = unknown> {
  token: string; name?: string; lifetime: ServiceLifetime; priority: number; version: string; lazy: boolean;
  factory: ServiceFactory<T>; onStart?(service: T): Promise<void> | void; onStop?(service: T): Promise<void> | void;
}
export class ServiceScope {
  private readonly scoped = new Map<string, unknown>();
  constructor(private readonly container: DIContainer) {}
  async resolve<T>(token: string, name = 'default'): Promise<T> { return this.container.resolve<T>(token, name, this); }
  getScoped<T>(key: string): T | undefined { return this.scoped.get(key) as T | undefined; }
  setScoped<T>(key: string, value: T): void { this.scoped.set(key, value); }
}
export class DIContainer {
  private readonly descriptors = new Map<string, ServiceDescriptor>();
  private readonly singletons = new Map<string, unknown>();
  register<T>(descriptor: ServiceDescriptor<T>): void { this.descriptors.set(this.key(descriptor.token, descriptor.name), descriptor); }
  createScope(): ServiceScope { return new ServiceScope(this); }
  async resolve<T>(token: string, name = 'default', scope = this.createScope()): Promise<T> {
    const key = this.key(token, name); const d = this.descriptors.get(key);
    if (!d) throw new ServiceNotFoundError(key);
    if (d.lifetime === 'singleton') return this.getOrCreate<T>(this.singletons, key, d, scope);
    if (d.lifetime === 'scoped') return this.getOrCreate<T>({ get: (k) => scope.getScoped(k), set: (k, v) => scope.setScoped(k, v) }, key, d, scope);
    return await d.factory(scope) as T;
  }
  private async getOrCreate<T>(store: { get(k: string): unknown; set(k: string, v: unknown): void }, key: string, d: ServiceDescriptor, scope: ServiceScope): Promise<T> {
    const existing = store.get(key);
    if (existing !== undefined) return existing as T;
    const created = await d.factory(scope);
    store.set(key, created);
    await d.onStart?.(created);
    return created as T;
  }
  private key(token: string, name = 'default'): string { return `${token}:${name}`; }
}

export interface RegistryRecord<T = unknown> { id: string; kind: string; version: string; priority: number; state: ServiceState; value: T; health(): Promise<ServiceState> | ServiceState; }
export class KernelRegistry {
  private readonly records = new Map<string, RegistryRecord[]>();
  register<T>(record: RegistryRecord<T>): void { const list = this.records.get(record.kind) ?? []; this.records.set(record.kind, [...list.filter((r) => r.id !== record.id), record].sort((a, b) => b.priority - a.priority)); }
  discover<T>(kind: string): RegistryRecord<T>[] { return [...(this.records.get(kind) ?? [])] as RegistryRecord<T>[]; }
  replace<T>(kind: string, id: string, record: RegistryRecord<T>): void { this.records.set(kind, [...(this.records.get(kind) ?? []).filter((r) => r.id !== id), record].sort((a, b) => b.priority - a.priority)); }
  async health(): Promise<Record<string, ServiceState>> { const out: Record<string, ServiceState> = {}; for (const records of this.records.values()) for (const r of records) out[r.id] = await r.health(); return out; }
}

export type EventPriority = 'low' | 'normal' | 'high' | 'critical';
export interface KernelMessage<T = unknown> {
  id: string; type: 'command' | 'query' | 'event' | 'broadcast' | 'pipeline'; name: string; payload: T;
  priority: EventPriority; createdAt: Date; orderingKey?: string; attempts: number; maxAttempts: number; persist: boolean; cancelled?: boolean;
}
export type Middleware = (message: KernelMessage, next: () => Promise<unknown>) => Promise<unknown>;
export type MessageHandler<T = unknown, O = unknown> = (message: KernelMessage<T>, context: KernelContext) => Promise<O> | O;
export class MessageBus {
  private readonly handlers = new Map<string, MessageHandler[]>();
  private readonly middleware: Middleware[] = [];
  private readonly persisted: KernelMessage[] = [];
  use(mw: Middleware): void { this.middleware.push(mw); }
  on(name: string, handler: MessageHandler): () => void { const list = this.handlers.get(name) ?? []; this.handlers.set(name, [...list, handler]); return () => this.handlers.set(name, (this.handlers.get(name) ?? []).filter((h) => h !== handler)); }
  async publish<T>(message: Omit<KernelMessage<T>, 'id' | 'createdAt' | 'attempts'>, context: KernelContext): Promise<unknown[]> {
    const full: KernelMessage<T> = { ...message, id: randomUUID(), createdAt: new Date(), attempts: 0 };
    if (full.persist) this.persisted.push(full);
    const handlers = [...(this.handlers.get(full.name) ?? []), ...(this.handlers.get('*') ?? [])];
    return Promise.all(handlers.map((handler) => this.invoke(full, context, handler)));
  }
  async command<T, O>(name: string, payload: T, context: KernelContext, options: Partial<KernelMessage> = {}): Promise<O> {
    const [result] = await this.publish({ type: 'command', name, payload, priority: options.priority ?? 'normal', maxAttempts: options.maxAttempts ?? 1, persist: options.persist ?? false }, context);
    return result as O;
  }
  persistedMessages(): KernelMessage[] { return [...this.persisted]; }
  private async invoke(message: KernelMessage, context: KernelContext, handler: MessageHandler): Promise<unknown> {
    while (message.attempts < message.maxAttempts) {
      if (message.cancelled || context.signal.aborted) throw new KernelError('MESSAGE_CANCELLED', `Message cancelled: ${message.name}`);
      try {
        message.attempts += 1;
        let index = 0;
        const run = async (): Promise<unknown> => {
          const mw = this.middleware[index++];
          return mw ? mw(message, run) : handler(message, context);
        };
        return await run();
      } catch (error) {
        if (message.attempts >= message.maxAttempts) throw error;
      }
    }
    throw new KernelError('MESSAGE_RETRY_EXHAUSTED', `Message retry budget exhausted: ${message.name}`);
  }
}

export class ResourceManager {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly tasks = new Map<string, AbortController>();
  limits = { maxWorkers: 4, maxTimers: 1000, maxMemoryBytes: 512 * 1024 * 1024 };
  timer(id: string, delayMs: number, fn: () => void): void {
    this.cancelTimer(id);
    if (this.timers.size >= this.limits.maxTimers) throw new KernelError('RESOURCE_LIMIT', 'Timer limit exceeded');
    this.timers.set(id, setTimeout(() => { this.timers.delete(id); fn(); }, delayMs));
  }
  task(id: string): AbortSignal { this.tasks.get(id)?.abort(); const controller = new AbortController(); this.tasks.set(id, controller); return controller.signal; }
  cancelTimer(id: string): void { const timer = this.timers.get(id); if (timer) clearTimeout(timer); this.timers.delete(id); }
  release(id: string): void { this.cancelTimer(id); this.tasks.get(id)?.abort(); this.tasks.delete(id); }
  snapshot() { return { timers: this.timers.size, tasks: this.tasks.size, limits: this.limits, memory: process.memoryUsage() }; }
  shutdown(): void { for (const id of [...this.timers.keys()]) this.release(id); }
}

export interface FeatureFlag { key: string; enabled: boolean; source: 'default' | 'runtime' | 'remote' | 'environment'; updatedAt: Date; }
export class FeatureFlags {
  private readonly flags = new Map<string, FeatureFlag>();
  constructor(env: NodeJS.ProcessEnv = process.env) { for (const [k, v] of Object.entries(env)) if (k.startsWith('IRP_FEATURE_')) this.set(k.slice(12).toLowerCase().replaceAll('_', '.'), v === '1' || v === 'true', 'environment'); }
  set(key: string, enabled: boolean, source: FeatureFlag['source'] = 'runtime'): void { this.flags.set(key, { key, enabled, source, updatedAt: new Date() }); }
  enable(key: string): void { this.set(key, true); }
  disable(key: string): void { this.set(key, false); }
  isEnabled(key: string): boolean { return this.flags.get(key)?.enabled ?? false; }
  snapshot(): FeatureFlag[] { return [...this.flags.values()]; }
}

export interface VersionedConfiguration<T = unknown> { schemaVersion: number; data: T; migrations: Record<number, (data: unknown) => unknown>; validate(data: T): string[]; compatibleWith: readonly number[]; }
export class ConfigurationStore {
  private readonly versions = new Map<string, VersionedConfiguration>();
  set<T>(key: string, config: VersionedConfiguration<T>): void { const errors = config.validate(config.data); if (errors.length) throw new KernelError('CONFIG_INVALID', errors.join('; ')); this.versions.set(key, config); }
  get<T>(key: string): VersionedConfiguration<T> | undefined { return this.versions.get(key) as VersionedConfiguration<T> | undefined; }
  migrate(key: string, target: number): void {
    const cfg = this.versions.get(key); if (!cfg) throw new KernelError('CONFIG_NOT_FOUND', key);
    if (!Number.isInteger(target) || target < cfg.schemaVersion) throw new KernelError('CONFIG_MIGRATION_INVALID', `Cannot migrate ${cfg.schemaVersion} -> ${target}`);
    let data: unknown = cfg.data;
    for (let v = cfg.schemaVersion; v < target; v += 1) {
      const migration = cfg.migrations[v];
      if (!migration) throw new KernelError('CONFIG_MIGRATION_MISSING', `Missing migration ${v} -> ${v + 1}`);
      data = migration(data);
    }
    const errors = cfg.validate(data as never);
    if (errors.length) throw new KernelError('CONFIG_INVALID', errors.join('; '));
    this.versions.set(key, { ...cfg, schemaVersion: target, data });
  }
  rollback(key: string, previous: VersionedConfiguration): void { this.versions.set(key, previous); }
}

export interface WorkflowDefinition { id: string; trigger: string; steps: WorkflowStep[]; timeoutMs?: number; }
export interface WorkflowStep { id: string; capability: Capability; action: string; input?: unknown; retry?: number; condition?: (context: KernelContext) => boolean | Promise<boolean>; }
export interface WorkflowResult { workflowId: string; simulated: boolean; steps: { id: string; action: string; status: 'skipped' | 'predicted' | 'completed'; durationMs: number; }[]; }
export class WorkflowEngine {
  constructor(private readonly bus: MessageBus) {}
  async run(def: WorkflowDefinition, context: KernelContext, simulate = false): Promise<WorkflowResult> {
    const steps: WorkflowResult['steps'] = [];
    const timeout = def.timeoutMs !== undefined ? setTimeout(() => undefined, def.timeoutMs) : undefined;
    try {
      for (const step of def.steps) {
        const started = performance.now();
        if (step.condition && !(await step.condition(context))) { steps.push({ id: step.id, action: step.action, status: 'skipped', durationMs: 0 }); continue; }
        context.capabilities.assert(context.principal, step.capability);
        if (!simulate) await this.bus.command(step.action, step.input, context, { maxAttempts: step.retry ?? 1 });
        steps.push({ id: step.id, action: step.action, status: simulate ? 'predicted' : 'completed', durationMs: performance.now() - started });
      }
      return { workflowId: def.id, simulated: simulate, steps };
    } finally { if (timeout) clearTimeout(timeout); }
  }
}

export interface StateTransition<S extends string> { from: S; to: S; event: string; }
export class StateMachine<S extends string> {
  constructor(public state: S, private readonly transitions: readonly StateTransition<S>[]) {}
  send(event: string): S { const t = this.transitions.find((x) => x.from === this.state && x.event === event); if (!t) throw new KernelError('INVALID_TRANSITION', `${this.state} -> ${event}`); this.state = t.to; return this.state; }
}

export class KernelRuntime {
  readonly id = randomUUID(); readonly abort = new AbortController(); readonly container = new DIContainer(); readonly registry = new KernelRegistry(); readonly bus = new MessageBus(); readonly resources = new ResourceManager(); readonly features = new FeatureFlags(); readonly config = new ConfigurationStore(); readonly capabilities = new CapabilityAuthorizer(); readonly workflows = new WorkflowEngine(this.bus); state: KernelState = 'created'; readonly metrics: Record<string, number> = {};
  constructor(private readonly logger: KernelLogger = silentLogger, private readonly principal: Principal = { id: 'kernel', capabilities: ['*.*'] }) {
    this.bus.use(async (message, next) => { const start = performance.now(); try { return await next(); } finally { this.metrics[`message.${message.name}.count`] = (this.metrics[`message.${message.name}.count`] ?? 0) + 1; this.metrics[`message.${message.name}.latencyMs`] = performance.now() - start; } });
  }
  context(principal = this.principal): KernelContext { return { kernelId: this.id, principal, startedAt: new Date(), signal: this.abort.signal, logger: this.logger, capabilities: this.capabilities, registry: this.registry, bus: this.bus, resources: this.resources, features: this.features, config: this.config }; }
  registerContract(contract: KernelContract): void {
    for (const [name, operation] of Object.entries(contract.operations)) this.bus.on(`${contract.namespace}.${name}`, (msg, ctx) => { ctx.capabilities.assert(ctx.principal, operation.capability); return operation.execute(msg.payload, ctx); });
    this.registry.register({ id: contract.namespace, kind: 'contract', version: contract.version, priority: 100, state: 'healthy', value: contract, health: () => 'healthy' });
  }
  async execute<I, O>(namespace: ContractNamespace, operation: string, input: I, options: OperationOptions = {}): Promise<O> {
    const messageOptions: Partial<KernelMessage> = { maxAttempts: 3 };
    if (options.priority) messageOptions.priority = options.priority; if (options.persist !== undefined) messageOptions.persist = options.persist;
    return this.bus.command<I, O>(`${namespace}.${operation}`, input, this.context(options.principal), messageOptions);
  }
  async start(): Promise<void> {
    if (this.state === 'running') return; this.state = 'bootstrapping';
    await this.bus.publish({ type: 'event', name: 'KernelBootstrapped', payload: { id: this.id }, priority: 'high', maxAttempts: 1, persist: true }, this.context()); this.state = 'running';
  }
  async stop(): Promise<void> { if (this.state === 'stopped') return; this.state = 'draining'; this.resources.shutdown(); this.abort.abort(); this.state = 'stopped'; }
}

export const createKernel = (logger?: KernelLogger): KernelRuntime => new KernelRuntime(logger);
export const createContract = (contract: KernelContract): KernelContract => contract;
