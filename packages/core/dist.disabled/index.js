import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { createAllBuiltinProviders } from '@irp/dns/provider-registry';
export { createAllBuiltinProviders } from '@irp/dns/provider-registry';
export { IntelligentDnsEngine } from '@irp/dns';
export { createMobileClientState, MobileClientCore } from './mobile-client.js';
export { createNetworkIntent, isIntentEffective, isIntentTerminal, transitionIntent, isAutonomyPermitted, } from './intent.js';
export class AppError extends Error {
    code;
    statusCode;
    details;
    constructor(code, message, statusCode = 500, details) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
    }
}
export class ValidationAppError extends AppError {
    constructor(message, details) {
        super('VALIDATION_ERROR', message, 400, details);
    }
}
export class UnauthorizedAppError extends AppError {
    constructor(message = 'Authentication is required') {
        super('UNAUTHORIZED', message, 401);
    }
}
export class ForbiddenAppError extends AppError {
    constructor(message = 'Insufficient permissions') {
        super('FORBIDDEN', message, 403);
    }
}
export class ConflictAppError extends AppError {
    constructor(message, details) {
        super('CONFLICT', message, 409, details);
    }
}
export class NotFoundAppError extends AppError {
    constructor(resource) {
        super('NOT_FOUND', `${resource} was not found`, 404);
    }
}
export const mapErrorToHttp = (error) => error instanceof AppError
    ? {
        statusCode: error.statusCode,
        body: {
            success: false,
            error: {
                code: error.code,
                message: error.message,
                ...(error.details ? { details: error.details } : {}),
            },
        },
    }
    : {
        statusCode: 500,
        body: {
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
        },
    };
export const createDomainEvent = (type, aggregateId, payload) => ({ id: randomUUID(), type, aggregateId, payload, occurredAt: new Date() });
export class Container {
    services = new Map();
    register(token, service) {
        this.services.set(token, service);
    }
    resolve(token) {
        const service = this.services.get(token);
        if (service === undefined)
            throw new Error(`Service not registered: ${token}`);
        return service;
    }
    has(token) {
        return this.services.has(token);
    }
}
class InternalEventBus {
    maxHistory;
    handlers = new Map();
    history = [];
    constructor(maxHistory = 500) {
        this.maxHistory = maxHistory;
    }
    subscribe(type, handler) {
        const set = this.handlers.get(type) ?? new Set();
        set.add(handler);
        this.handlers.set(type, set);
        return () => set.delete(handler);
    }
    async publish(eventOrType, payload) {
        const event = typeof eventOrType === 'string'
            ? createDomainEvent(eventOrType, eventOrType, payload)
            : eventOrType;
        this.history.push(event);
        if (this.history.length > this.maxHistory)
            this.history.splice(0, this.history.length - this.maxHistory);
        const handlers = [...(this.handlers.get(event.type) ?? []), ...(this.handlers.get('*') ?? [])];
        await Promise.all(handlers.map((handler) => handler(event)));
    }
    snapshot() {
        return [...this.history];
    }
}
export class Scheduler {
    logger;
    timers = new Map();
    stopping = false;
    constructor(logger) {
        this.logger = logger;
    }
    schedule(options, job) {
        this.cancel(options.id);
        const run = async (attempt = 0) => {
            if (this.stopping)
                return;
            const started = Date.now();
            try {
                await job();
                this.logger?.debug('scheduler job completed', {
                    id: options.id,
                    latencyMs: Date.now() - started,
                });
            }
            catch (error) {
                const retry = options.retry;
                if (retry && attempt < retry.attempts && !this.stopping) {
                    const backoff = Math.min(retry.maxDelayMs, retry.baseDelayMs * 2 ** attempt);
                    const jitter = backoff * retry.jitterRatio * Math.random();
                    this.timers.set(options.id, setTimeout(() => void run(attempt + 1), backoff + jitter));
                    return;
                }
                this.logger?.error('scheduler job failed', {
                    id: options.id,
                    error: error instanceof Error ? error.message : 'unknown',
                });
            }
            if (options.intervalMs && !this.stopping)
                this.timers.set(options.id, setTimeout(() => void run(0), options.intervalMs));
        };
        const delay = Math.max(0, (options.runAt?.getTime() ?? Date.now()) - Date.now());
        this.timers.set(options.id, setTimeout(() => void run(), delay));
        return () => this.cancel(options.id);
    }
    cancel(id) {
        const timer = this.timers.get(id);
        if (timer)
            clearTimeout(timer);
        this.timers.delete(id);
    }
    async start() {
        this.stopping = false;
    }
    async stop() {
        this.stopping = true;
        for (const id of [...this.timers.keys()])
            this.cancel(id);
    }
}
export class BenchmarkEngine {
    events;
    maxSamples;
    samples = new Map();
    constructor(events, maxSamples = 200) {
        this.events = events;
        this.maxSamples = maxSamples;
    }
    async run(providers, question = { name: 'example.com', recordType: 'A' }) {
        const results = await Promise.all(providers.map(async (provider) => {
            const started = performance.now();
            try {
                await provider.resolve(question, { timeoutMs: provider.config.timeoutMs });
                return {
                    providerId: provider.id,
                    latencyMs: performance.now() - started,
                    success: true,
                    timedOut: false,
                    timestamp: new Date().toISOString(),
                };
            }
            catch (error) {
                return {
                    providerId: provider.id,
                    latencyMs: performance.now() - started,
                    success: false,
                    timedOut: error instanceof Error && error.message.toLowerCase().includes('timeout'),
                    error: error instanceof Error ? error.message : 'unknown',
                    timestamp: new Date().toISOString(),
                };
            }
        }));
        for (const sample of results)
            this.record(sample);
        await this.events?.publish('BenchmarkCompleted', { results });
        return results;
    }
    record(sample) {
        const list = this.samples.get(sample.providerId) ?? [];
        list.push(sample);
        this.samples.set(sample.providerId, list.slice(-this.maxSamples));
    }
    stats(providerId) {
        const list = this.samples.get(providerId) ?? [];
        const successes = list.filter((s) => s.success);
        const latencies = successes.map((s) => s.latencyMs);
        const average = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1);
        const jitter = latencies.reduce((a, b) => a + Math.abs(b - average), 0) / (latencies.length || 1);
        return {
            count: list.length,
            successes: successes.length,
            failures: list.length - successes.length,
            packetLoss: list.length ? (list.length - successes.length) / list.length : 0,
            timeoutRate: list.length ? list.filter((s) => s.timedOut).length / list.length : 0,
            jitterMs: jitter,
            averageResponseTimeMs: average,
            availability: list.length ? successes.length / list.length : 0,
            successRatio: list.length ? successes.length / list.length : 0,
            lastLatencyMs: latencies.at(-1),
        };
    }
    snapshot() {
        return Object.fromEntries([...this.samples.keys()].map((id) => [id, this.stats(id)]));
    }
}
export class HealthScorer {
    score(provider, stats) {
        const latency = Math.max(0, 40 - Math.min(40, stats.averageResponseTimeMs / 10));
        const reliability = (1 - stats.packetLoss) * 25 + (1 - stats.timeoutRate) * 15 + stats.successRatio * 10;
        const support = (provider.supportsDNSSEC() ? 4 : 0) +
            (provider.supportsDoH() ? 3 : 0) +
            (provider.supportsDoT() ? 3 : 0);
        const stability = Math.max(0, 10 - stats.jitterMs / 20);
        return Math.round(Math.max(0, Math.min(100, latency + reliability + support + stability)));
    }
}
export class Cache {
    values = new Map();
    set(key, value, ttlMs) {
        this.values.set(key, { value, expiresAt: Date.now() + ttlMs });
    }
    get(key) {
        const item = this.values.get(key);
        if (!item)
            return null;
        if (item.expiresAt <= Date.now()) {
            this.values.delete(key);
            return null;
        }
        return item.value;
    }
    delete(key) {
        this.values.delete(key);
    }
    size() {
        return this.values.size;
    }
}
export class Application {
    config;
    logger;
    container;
    plugins = [];
    events = new InternalEventBus();
    scheduler;
    providers = createAllBuiltinProviders();
    benchmark = new BenchmarkEngine(this.events);
    scorer = new HealthScorer();
    state = 'created';
    constructor(config, logger, container = new Container()) {
        this.config = config;
        this.logger = logger;
        this.container = container;
        this.scheduler = new Scheduler(logger);
        container.register('events', this.events);
        container.register('scheduler', this.scheduler);
        container.register('providers', this.providers);
        container.register('benchmark', this.benchmark);
    }
    use(plugin) {
        this.plugins.push(plugin);
    }
    async start() {
        if (this.state === 'running' || this.state === 'starting')
            return;
        this.state = 'starting';
        await this.scheduler.start();
        for (const plugin of this.plugins) {
            await plugin.install?.(this.container);
            await plugin.initialize?.({
                config: this.config,
                logger: this.logger,
                container: this.container,
                events: this.events,
            });
            await plugin.start();
        }
        this.state = 'running';
        this.logger.info('application started', { plugins: this.plugins.map((p) => p.id) });
    }
    async stop() {
        if (this.state === 'stopped' || this.state === 'stopping')
            return;
        this.state = 'stopping';
        await this.scheduler.stop();
        for (const plugin of [...this.plugins].reverse()) {
            await plugin.stop();
            await plugin.unload?.();
        }
        this.state = 'stopped';
        this.logger.info('application stopped');
    }
    async reload(config) {
        this.config = config;
        await this.events.publish('ConfigurationReloaded', { environment: config.app.environment });
    }
}
//# sourceMappingURL=index.js.map