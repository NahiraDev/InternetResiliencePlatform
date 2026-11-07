export type KernelState = 'created' | 'bootstrapping' | 'running' | 'draining' | 'stopped' | 'failed';
export type ServiceState = 'registered' | 'starting' | 'healthy' | 'degraded' | 'unhealthy' | 'stopped';
export type LifecycleState<T extends string> = T;
export type Capability = `${string}.${string}`;
export declare const KernelCapabilities: readonly ["dns.resolve", "dns.modify", "vpn.connect", "vpn.disconnect", "proxy.forward", "network.capture", "network.route", "network.inspect", "storage.read", "storage.write", "storage.encrypt", "crypto.sign", "crypto.verify", "telemetry.publish", "plugin.load", "plugin.install", "scheduler.execute", "workflow.run"];
export type BuiltinCapability = (typeof KernelCapabilities)[number];
export interface Principal {
    id: string;
    capabilities: readonly Capability[];
    metadata?: Record<string, string>;
}
export interface KernelLogger {
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
}
export declare const silentLogger: KernelLogger;
export interface KernelContext {
    kernelId: string;
    principal: Principal;
    startedAt: Date;
    signal: AbortSignal;
    logger: KernelLogger;
    capabilities: CapabilityAuthorizer;
    registry: KernelRegistry;
    bus: MessageBus;
    resources: ResourceManager;
    features: FeatureFlags;
    config: ConfigurationStore;
}
export interface OperationOptions {
    principal?: Principal;
    signal?: AbortSignal;
    timeoutMs?: number;
    priority?: EventPriority;
    persist?: boolean;
}
export interface ContractOperation<I = unknown, O = unknown> {
    capability: Capability;
    execute(input: I, context: KernelContext): Promise<O> | O;
}
export interface KernelContract {
    readonly namespace: ContractNamespace;
    readonly version: string;
    readonly operations: Readonly<Record<string, ContractOperation>>;
}
export type ContractNamespace = 'dns' | 'vpn' | 'proxy' | 'tunnel' | 'routing' | 'storage' | 'security' | 'telemetry' | 'metrics' | 'plugin' | 'ai' | 'notifications' | 'configuration' | 'health' | 'scheduler';
export type ContractMap = Partial<Record<ContractNamespace, KernelContract>>;
export declare class KernelError extends Error {
    readonly code: string;
    readonly details: Record<string, unknown>;
    constructor(code: string, message: string, details?: Record<string, unknown>);
}
export declare class CapabilityError extends KernelError {
    constructor(capability: Capability);
}
export declare class ServiceNotFoundError extends KernelError {
    constructor(token: string);
}
export declare class CapabilityAuthorizer {
    assert(principal: Principal, capability: Capability): void;
    can(principal: Principal, capability: Capability): boolean;
}
export type ServiceLifetime = 'singleton' | 'scoped' | 'transient';
export type ServiceFactory<T> = (scope: ServiceScope) => T | Promise<T>;
export interface ServiceDescriptor<T = unknown> {
    token: string;
    name?: string;
    lifetime: ServiceLifetime;
    priority: number;
    version: string;
    lazy: boolean;
    factory: ServiceFactory<T>;
    onStart?(service: T): Promise<void> | void;
    onStop?(service: T): Promise<void> | void;
}
export declare class ServiceScope {
    private readonly container;
    private readonly scoped;
    constructor(container: DIContainer);
    resolve<T>(token: string, name?: string): Promise<T>;
    getScoped<T>(key: string): T | undefined;
    setScoped<T>(key: string, value: T): void;
}
export declare class DIContainer {
    private readonly descriptors;
    private readonly singletons;
    register<T>(descriptor: ServiceDescriptor<T>): void;
    createScope(): ServiceScope;
    resolve<T>(token: string, name?: string, scope?: ServiceScope): Promise<T>;
    private getOrCreate;
    private key;
}
export interface RegistryRecord<T = unknown> {
    id: string;
    kind: string;
    version: string;
    priority: number;
    state: ServiceState;
    value: T;
    health(): Promise<ServiceState> | ServiceState;
}
export declare class KernelRegistry {
    private readonly records;
    register<T>(record: RegistryRecord<T>): void;
    discover<T>(kind: string): RegistryRecord<T>[];
    replace<T>(kind: string, id: string, record: RegistryRecord<T>): void;
    health(): Promise<Record<string, ServiceState>>;
}
export type EventPriority = 'low' | 'normal' | 'high' | 'critical';
export interface KernelMessage<T = unknown> {
    id: string;
    type: 'command' | 'query' | 'event' | 'broadcast' | 'pipeline';
    name: string;
    payload: T;
    priority: EventPriority;
    createdAt: Date;
    orderingKey?: string;
    attempts: number;
    maxAttempts: number;
    persist: boolean;
    cancelled?: boolean;
}
export type Middleware = (message: KernelMessage, next: () => Promise<unknown>) => Promise<unknown>;
export type MessageHandler<T = unknown, O = unknown> = (message: KernelMessage<T>, context: KernelContext) => Promise<O> | O;
export declare class MessageBus {
    private readonly handlers;
    private readonly middleware;
    private readonly persisted;
    use(mw: Middleware): void;
    on(name: string, handler: MessageHandler): () => void;
    publish<T>(message: Omit<KernelMessage<T>, 'id' | 'createdAt' | 'attempts'>, context: KernelContext): Promise<unknown[]>;
    command<T, O>(name: string, payload: T, context: KernelContext, options?: Partial<KernelMessage>): Promise<O>;
    persistedMessages(): KernelMessage[];
    private invoke;
}
export declare class ResourceManager {
    private readonly timers;
    private readonly tasks;
    limits: {
        maxWorkers: number;
        maxTimers: number;
        maxMemoryBytes: number;
    };
    timer(id: string, delayMs: number, fn: () => void): void;
    task(id: string): AbortSignal;
    cancelTimer(id: string): void;
    release(id: string): void;
    snapshot(): {
        timers: number;
        tasks: number;
        limits: {
            maxWorkers: number;
            maxTimers: number;
            maxMemoryBytes: number;
        };
        memory: NodeJS.MemoryUsage;
    };
    shutdown(): void;
}
export interface FeatureFlag {
    key: string;
    enabled: boolean;
    source: 'default' | 'runtime' | 'remote' | 'environment';
    updatedAt: Date;
}
export declare class FeatureFlags {
    private readonly flags;
    constructor(env?: NodeJS.ProcessEnv);
    set(key: string, enabled: boolean, source?: FeatureFlag['source']): void;
    enable(key: string): void;
    disable(key: string): void;
    isEnabled(key: string): boolean;
    snapshot(): FeatureFlag[];
}
export interface VersionedConfiguration<T = unknown> {
    schemaVersion: number;
    data: T;
    migrations: Record<number, (data: unknown) => unknown>;
    validate(data: T): string[];
    compatibleWith: readonly number[];
}
export declare class ConfigurationStore {
    private readonly versions;
    set<T>(key: string, config: VersionedConfiguration<T>): void;
    get<T>(key: string): VersionedConfiguration<T> | undefined;
    migrate(key: string, target: number): void;
    rollback(key: string, previous: VersionedConfiguration): void;
}
export interface WorkflowDefinition {
    id: string;
    trigger: string;
    steps: WorkflowStep[];
    timeoutMs?: number;
}
export interface WorkflowStep {
    id: string;
    capability: Capability;
    action: string;
    input?: unknown;
    retry?: number;
    condition?: (context: KernelContext) => boolean | Promise<boolean>;
}
export interface WorkflowResult {
    workflowId: string;
    simulated: boolean;
    steps: {
        id: string;
        action: string;
        status: 'skipped' | 'predicted' | 'completed';
        durationMs: number;
    }[];
}
export declare class WorkflowEngine {
    private readonly bus;
    constructor(bus: MessageBus);
    run(def: WorkflowDefinition, context: KernelContext, simulate?: boolean): Promise<WorkflowResult>;
}
export interface StateTransition<S extends string> {
    from: S;
    to: S;
    event: string;
}
export declare class StateMachine<S extends string> {
    state: S;
    private readonly transitions;
    constructor(state: S, transitions: readonly StateTransition<S>[]);
    send(event: string): S;
}
export declare class KernelRuntime {
    private readonly logger;
    private readonly principal;
    readonly id: `${string}-${string}-${string}-${string}-${string}`;
    readonly abort: AbortController;
    readonly container: DIContainer;
    readonly registry: KernelRegistry;
    readonly bus: MessageBus;
    readonly resources: ResourceManager;
    readonly features: FeatureFlags;
    readonly config: ConfigurationStore;
    readonly capabilities: CapabilityAuthorizer;
    readonly workflows: WorkflowEngine;
    state: KernelState;
    readonly metrics: Record<string, number>;
    constructor(logger?: KernelLogger, principal?: Principal);
    context(principal?: Principal): KernelContext;
    registerContract(contract: KernelContract): void;
    execute<I, O>(namespace: ContractNamespace, operation: string, input: I, options?: OperationOptions): Promise<O>;
    start(): Promise<void>;
    stop(): Promise<void>;
}
export declare const createKernel: (logger?: KernelLogger) => KernelRuntime;
export declare const createContract: (contract: KernelContract) => KernelContract;
//# sourceMappingURL=index.d.ts.map