import type { AppConfig } from '@irp/config';
import type { Logger } from '@irp/logger';
import type { BenchmarkSample, DnsProvider, DnsQuestion } from '@irp/dns';
export { createAllBuiltinProviders } from '@irp/dns/provider-registry';
export { IntelligentDnsEngine } from '@irp/dns';
export { createMobileClientState, MobileClientCore } from './mobile-client.js';
export type { MobileClientEvent, MobileClientListener, MobileClientPolicy, MobileClientState, MobileConnectionState, MobileDiagnosticsAdapter, MobileNetworkSnapshot, MobilePlatform, } from './mobile-client.js';
export { createNetworkIntent, isIntentEffective, isIntentTerminal, transitionIntent, isAutonomyPermitted, } from './intent.js';
export type { IntentCommand, IntentPriority, IntentStatus, NetworkIntent, NetworkIntentSpec, IntentAutonomyLevel, IntentObjective, } from './intent.js';
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
    events: InternalEventBus;
}
export type RuntimeState = 'created' | 'starting' | 'running' | 'stopping' | 'stopped';
export type EventType = 'ProviderHealthy' | 'ProviderUnhealthy' | 'ProviderRecovered' | 'ConfigurationReloaded' | 'NetworkChanged' | 'ConnectivityLost' | 'ConnectivityRestored' | 'BenchmarkCompleted';
export interface DomainEvent<T = unknown> {
    id: string;
    type: string;
    aggregateId: string;
    occurredAt: Date;
    payload: T;
    metadata?: Record<string, string>;
}
export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => Promise<void> | void;
export declare class AppError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly details?: Record<string, unknown> | undefined;
    constructor(code: string, message: string, statusCode?: number, details?: Record<string, unknown> | undefined);
}
export declare class ValidationAppError extends AppError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class UnauthorizedAppError extends AppError {
    constructor(message?: string);
}
export declare class ForbiddenAppError extends AppError {
    constructor(message?: string);
}
export declare class ConflictAppError extends AppError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class NotFoundAppError extends AppError {
    constructor(resource: string);
}
export declare const mapErrorToHttp: (error: unknown) => {
    statusCode: number;
    body: {
        success: false;
        error: {
            code: string;
            message: string;
            details?: Record<string, unknown>;
        };
    };
};
export declare const createDomainEvent: <T>(type: string, aggregateId: string, payload: T) => DomainEvent<T>;
export declare class Container {
    private readonly services;
    register<T>(token: string, service: T): void;
    resolve<T>(token: string): T;
    has(token: string): boolean;
}
declare class InternalEventBus {
    private readonly maxHistory;
    private readonly handlers;
    private readonly history;
    constructor(maxHistory?: number);
    subscribe<T extends DomainEvent>(type: T['type'] | '*', handler: EventHandler<T>): () => void;
    publish<T extends DomainEvent>(event: T): Promise<void>;
    publish(type: string, payload: unknown): Promise<void>;
    snapshot(): DomainEvent[];
}
export interface JobOptions {
    id: string;
    intervalMs?: number;
    runAt?: Date;
    retry?: {
        attempts: number;
        baseDelayMs: number;
        maxDelayMs: number;
        jitterRatio: number;
    };
}
export declare class Scheduler implements Lifecycle {
    private readonly logger?;
    private readonly timers;
    private stopping;
    constructor(logger?: Logger | undefined);
    schedule(options: JobOptions, job: () => Promise<void> | void): () => void;
    cancel(id: string): void;
    start(): Promise<void>;
    stop(): Promise<void>;
}
export interface RollingStats {
    count: number;
    successes: number;
    failures: number;
    packetLoss: number;
    timeoutRate: number;
    jitterMs: number;
    averageResponseTimeMs: number;
    availability: number;
    successRatio: number;
    lastLatencyMs?: number | undefined;
}
export declare class BenchmarkEngine {
    private readonly events?;
    private readonly maxSamples;
    private readonly samples;
    constructor(events?: InternalEventBus | undefined, maxSamples?: number);
    run(providers: DnsProvider[], question?: DnsQuestion): Promise<BenchmarkSample[]>;
    record(sample: BenchmarkSample): void;
    stats(providerId: string): RollingStats;
    snapshot(): Record<string, RollingStats>;
}
export declare class HealthScorer {
    score(provider: DnsProvider, stats: RollingStats): number;
}
export declare class Cache<T = unknown> {
    private readonly values;
    set(key: string, value: T, ttlMs: number): void;
    get(key: string): T | null;
    delete(key: string): void;
    size(): number;
}
export declare class Application implements Lifecycle {
    config: AppConfig;
    readonly logger: Logger;
    readonly container: Container;
    private readonly plugins;
    readonly events: InternalEventBus;
    readonly scheduler: Scheduler;
    readonly providers: DnsProvider[];
    readonly benchmark: BenchmarkEngine;
    readonly scorer: HealthScorer;
    state: RuntimeState;
    constructor(config: AppConfig, logger: Logger, container?: Container);
    use(plugin: Plugin): void;
    start(): Promise<void>;
    stop(): Promise<void>;
    reload(config: AppConfig): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map