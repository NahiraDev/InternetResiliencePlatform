import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
export const KernelCapabilities = [
    'dns.resolve',
    'dns.modify',
    'vpn.connect',
    'vpn.disconnect',
    'proxy.forward',
    'network.capture',
    'network.route',
    'network.inspect',
    'storage.read',
    'storage.write',
    'storage.encrypt',
    'crypto.sign',
    'crypto.verify',
    'telemetry.publish',
    'plugin.load',
    'plugin.install',
    'scheduler.execute',
    'workflow.run',
];
export const silentLogger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
};
export class KernelError extends Error {
    code;
    details;
    constructor(code, message, details = {}) {
        super(message);
        this.code = code;
        this.details = details;
    }
}
export class CapabilityError extends KernelError {
    constructor(capability) {
        super('CAPABILITY_DENIED', `Missing capability: ${capability}`, { capability });
    }
}
export class ServiceNotFoundError extends KernelError {
    constructor(token) {
        super('SERVICE_NOT_FOUND', `Service is not registered: ${token}`, { token });
    }
}
export class CapabilityAuthorizer {
    assert(principal, capability) {
        if (!principal.capabilities.includes(capability) && !principal.capabilities.includes('*.*'))
            throw new CapabilityError(capability);
    }
    can(principal, capability) {
        try {
            this.assert(principal, capability);
            return true;
        }
        catch {
            return false;
        }
    }
}
export class ServiceScope {
    container;
    scoped = new Map();
    constructor(container) {
        this.container = container;
    }
    async resolve(token, name = 'default') {
        return this.container.resolve(token, name, this);
    }
    getScoped(key) {
        return this.scoped.get(key);
    }
    setScoped(key, value) {
        this.scoped.set(key, value);
    }
}
export class DIContainer {
    descriptors = new Map();
    singletons = new Map();
    register(descriptor) {
        this.descriptors.set(this.key(descriptor.token, descriptor.name), descriptor);
    }
    createScope() {
        return new ServiceScope(this);
    }
    async resolve(token, name = 'default', scope = this.createScope()) {
        const key = this.key(token, name);
        const d = this.descriptors.get(key);
        if (!d)
            throw new ServiceNotFoundError(key);
        if (d.lifetime === 'singleton')
            return this.getOrCreate(this.singletons, key, d, scope);
        if (d.lifetime === 'scoped')
            return this.getOrCreate({ get: (k) => scope.getScoped(k), set: (k, v) => scope.setScoped(k, v) }, key, d, scope);
        return (await d.factory(scope));
    }
    async getOrCreate(store, key, d, scope) {
        const existing = store.get(key);
        if (existing !== undefined)
            return existing;
        const created = await d.factory(scope);
        store.set(key, created);
        await d.onStart?.(created);
        return created;
    }
    key(token, name = 'default') {
        return `${token}:${name}`;
    }
}
export class KernelRegistry {
    records = new Map();
    register(record) {
        const list = this.records.get(record.kind) ?? [];
        this.records.set(record.kind, [...list.filter((r) => r.id !== record.id), record].sort((a, b) => b.priority - a.priority));
    }
    discover(kind) {
        return [...(this.records.get(kind) ?? [])];
    }
    replace(kind, id, record) {
        this.records.set(kind, [...(this.records.get(kind) ?? []).filter((r) => r.id !== id), record].sort((a, b) => b.priority - a.priority));
    }
    async health() {
        const out = {};
        for (const records of this.records.values())
            for (const r of records)
                out[r.id] = await r.health();
        return out;
    }
}
export class MessageBus {
    handlers = new Map();
    middleware = [];
    persisted = [];
    use(mw) {
        this.middleware.push(mw);
    }
    on(name, handler) {
        const list = this.handlers.get(name) ?? [];
        this.handlers.set(name, [...list, handler]);
        return () => this.handlers.set(name, (this.handlers.get(name) ?? []).filter((h) => h !== handler));
    }
    async publish(message, context) {
        const full = {
            ...message,
            id: randomUUID(),
            createdAt: new Date(),
            attempts: 0,
        };
        if (full.persist)
            this.persisted.push(full);
        const handlers = [...(this.handlers.get(full.name) ?? []), ...(this.handlers.get('*') ?? [])];
        return Promise.all(handlers.map((handler) => this.invoke(full, context, handler)));
    }
    async command(name, payload, context, options = {}) {
        const [result] = await this.publish({
            type: 'command',
            name,
            payload,
            priority: options.priority ?? 'normal',
            maxAttempts: options.maxAttempts ?? 1,
            persist: options.persist ?? false,
        }, context);
        return result;
    }
    persistedMessages() {
        return [...this.persisted];
    }
    async invoke(message, context, handler) {
        while (message.attempts < message.maxAttempts) {
            if (message.cancelled || context.signal.aborted)
                throw new KernelError('MESSAGE_CANCELLED', `Message cancelled: ${message.name}`);
            try {
                message.attempts += 1;
                let index = 0;
                const run = async () => {
                    const mw = this.middleware[index++];
                    return mw ? mw(message, run) : handler(message, context);
                };
                return await run();
            }
            catch (error) {
                if (message.attempts >= message.maxAttempts)
                    throw error;
            }
        }
        throw new KernelError('MESSAGE_RETRY_EXHAUSTED', `Message retry budget exhausted: ${message.name}`);
    }
}
export class ResourceManager {
    timers = new Map();
    tasks = new Map();
    limits = { maxWorkers: 4, maxTimers: 1000, maxMemoryBytes: 512 * 1024 * 1024 };
    timer(id, delayMs, fn) {
        this.cancelTimer(id);
        if (this.timers.size >= this.limits.maxTimers)
            throw new KernelError('RESOURCE_LIMIT', 'Timer limit exceeded');
        this.timers.set(id, setTimeout(() => {
            this.timers.delete(id);
            fn();
        }, delayMs));
    }
    task(id) {
        this.tasks.get(id)?.abort();
        const controller = new AbortController();
        this.tasks.set(id, controller);
        return controller.signal;
    }
    cancelTimer(id) {
        const timer = this.timers.get(id);
        if (timer)
            clearTimeout(timer);
        this.timers.delete(id);
    }
    release(id) {
        this.cancelTimer(id);
        this.tasks.get(id)?.abort();
        this.tasks.delete(id);
    }
    snapshot() {
        return {
            timers: this.timers.size,
            tasks: this.tasks.size,
            limits: this.limits,
            memory: process.memoryUsage(),
        };
    }
    shutdown() {
        for (const id of [...this.timers.keys()])
            this.release(id);
    }
}
export class FeatureFlags {
    flags = new Map();
    constructor(env = process.env) {
        for (const [k, v] of Object.entries(env))
            if (k.startsWith('IRP_FEATURE_'))
                this.set(k.slice(12).toLowerCase().replaceAll('_', '.'), v === '1' || v === 'true', 'environment');
    }
    set(key, enabled, source = 'runtime') {
        this.flags.set(key, { key, enabled, source, updatedAt: new Date() });
    }
    enable(key) {
        this.set(key, true);
    }
    disable(key) {
        this.set(key, false);
    }
    isEnabled(key) {
        return this.flags.get(key)?.enabled ?? false;
    }
    snapshot() {
        return [...this.flags.values()];
    }
}
export class ConfigurationStore {
    versions = new Map();
    set(key, config) {
        const errors = config.validate(config.data);
        if (errors.length)
            throw new KernelError('CONFIG_INVALID', errors.join('; '));
        this.versions.set(key, config);
    }
    get(key) {
        return this.versions.get(key);
    }
    migrate(key, target) {
        const cfg = this.versions.get(key);
        if (!cfg)
            throw new KernelError('CONFIG_NOT_FOUND', key);
        if (!Number.isInteger(target) || target < cfg.schemaVersion)
            throw new KernelError('CONFIG_MIGRATION_INVALID', `Cannot migrate ${cfg.schemaVersion} -> ${target}`);
        let data = cfg.data;
        for (let v = cfg.schemaVersion; v < target; v += 1) {
            const migration = cfg.migrations[v];
            if (!migration)
                throw new KernelError('CONFIG_MIGRATION_MISSING', `Missing migration ${v} -> ${v + 1}`);
            data = migration(data);
        }
        const errors = cfg.validate(data);
        if (errors.length)
            throw new KernelError('CONFIG_INVALID', errors.join('; '));
        this.versions.set(key, { ...cfg, schemaVersion: target, data });
    }
    rollback(key, previous) {
        this.versions.set(key, previous);
    }
}
function createLinkedAbortController(parent, timeoutMs, timeoutCode = 'TIMEOUT') {
    const controller = new AbortController();
    let timedOut = false;
    let timer;
    const onAbort = () => controller.abort(parent.reason);
    if (parent.aborted)
        controller.abort(parent.reason);
    else
        parent.addEventListener('abort', onAbort, { once: true });
    if (timeoutMs !== undefined) {
        if (!Number.isFinite(timeoutMs) || timeoutMs < 0)
            throw new KernelError('TIMEOUT_INVALID', `Invalid timeout: ${timeoutMs}`);
        timer = setTimeout(() => {
            timedOut = true;
            controller.abort(new KernelError(timeoutCode, `Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    }
    return {
        controller,
        cleanup: () => {
            parent.removeEventListener('abort', onAbort);
            if (timer)
                clearTimeout(timer);
        },
        timedOut: () => timedOut,
    };
}
export class WorkflowEngine {
    bus;
    constructor(bus) {
        this.bus = bus;
    }
    async run(def, context, simulate = false) {
        const steps = [];
        const linked = createLinkedAbortController(context.signal, def.timeoutMs, 'WORKFLOW_TIMEOUT');
        const workflowContext = { ...context, signal: linked.controller.signal };
        const execute = async () => {
            for (const step of def.steps) {
                const started = performance.now();
                if (workflowContext.signal.aborted)
                    throw new KernelError('WORKFLOW_CANCELLED', `Workflow cancelled: ${def.id}`);
                if (step.condition && !(await step.condition(workflowContext))) {
                    steps.push({ id: step.id, action: step.action, status: 'skipped', durationMs: 0 });
                    continue;
                }
                workflowContext.capabilities.assert(workflowContext.principal, step.capability);
                if (!simulate)
                    await this.bus.command(step.action, step.input, workflowContext, {
                        maxAttempts: step.retry ?? 1,
                    });
                steps.push({
                    id: step.id,
                    action: step.action,
                    status: simulate ? 'predicted' : 'completed',
                    durationMs: performance.now() - started,
                });
            }
            return { workflowId: def.id, simulated: simulate, steps };
        };
        const timeoutMs = def.timeoutMs;
        let timeoutWatcher;
        try {
            return await Promise.race([
                execute(),
                new Promise((_, reject) => {
                    if (timeoutMs === undefined)
                        return;
                    timeoutWatcher = setTimeout(() => {
                        if (linked.timedOut())
                            reject(new KernelError('WORKFLOW_TIMEOUT', `Workflow timed out after ${timeoutMs}ms`, {
                                workflowId: def.id,
                                timeoutMs,
                            }));
                    }, Math.max(1, timeoutMs));
                }),
            ]);
        }
        finally {
            if (timeoutWatcher)
                clearTimeout(timeoutWatcher);
            linked.cleanup();
        }
    }
}
export class StateMachine {
    state;
    transitions;
    constructor(state, transitions) {
        this.state = state;
        this.transitions = transitions;
    }
    send(event) {
        const t = this.transitions.find((x) => x.from === this.state && x.event === event);
        if (!t)
            throw new KernelError('INVALID_TRANSITION', `${this.state} -> ${event}`);
        this.state = t.to;
        return this.state;
    }
}
export class KernelRuntime {
    logger;
    principal;
    id = randomUUID();
    abort = new AbortController();
    container = new DIContainer();
    registry = new KernelRegistry();
    bus = new MessageBus();
    resources = new ResourceManager();
    features = new FeatureFlags();
    config = new ConfigurationStore();
    capabilities = new CapabilityAuthorizer();
    workflows = new WorkflowEngine(this.bus);
    state = 'created';
    metrics = {};
    constructor(logger = silentLogger, principal = { id: 'kernel', capabilities: ['*.*'] }) {
        this.logger = logger;
        this.principal = principal;
        this.bus.use(async (message, next) => {
            const start = performance.now();
            try {
                return await next();
            }
            finally {
                this.metrics[`message.${message.name}.count`] =
                    (this.metrics[`message.${message.name}.count`] ?? 0) + 1;
                this.metrics[`message.${message.name}.latencyMs`] = performance.now() - start;
            }
        });
    }
    context(principal = this.principal) {
        return {
            kernelId: this.id,
            principal,
            startedAt: new Date(),
            signal: this.abort.signal,
            logger: this.logger,
            capabilities: this.capabilities,
            registry: this.registry,
            bus: this.bus,
            resources: this.resources,
            features: this.features,
            config: this.config,
        };
    }
    registerContract(contract) {
        for (const [name, operation] of Object.entries(contract.operations))
            this.bus.on(`${contract.namespace}.${name}`, (msg, ctx) => {
                ctx.capabilities.assert(ctx.principal, operation.capability);
                return operation.execute(msg.payload, ctx);
            });
        this.registry.register({
            id: contract.namespace,
            kind: 'contract',
            version: contract.version,
            priority: 100,
            state: 'healthy',
            value: contract,
            health: () => 'healthy',
        });
    }
    async execute(namespace, operation, input, options = {}) {
        const linked = createLinkedAbortController(this.abort.signal, options.timeoutMs);
        const messageOptions = { maxAttempts: 3 };
        if (options.priority)
            messageOptions.priority = options.priority;
        if (options.persist !== undefined)
            messageOptions.persist = options.persist;
        const context = this.context(options.principal);
        const operationContext = { ...context, signal: linked.controller.signal };
        try {
            return await this.bus.command(`${namespace}.${operation}`, input, operationContext, messageOptions);
        }
        catch (error) {
            if (linked.timedOut())
                throw new KernelError('OPERATION_TIMEOUT', `Operation timed out after ${options.timeoutMs}ms`, { namespace, operation, timeoutMs: options.timeoutMs });
            throw error;
        }
        finally {
            linked.cleanup();
        }
    }
    async start() {
        if (this.state === 'running')
            return;
        this.state = 'bootstrapping';
        await this.bus.publish({
            type: 'event',
            name: 'KernelBootstrapped',
            payload: { id: this.id },
            priority: 'high',
            maxAttempts: 1,
            persist: true,
        }, this.context());
        this.state = 'running';
    }
    async stop() {
        if (this.state === 'stopped')
            return;
        this.state = 'draining';
        this.resources.shutdown();
        this.abort.abort();
        this.state = 'stopped';
    }
}
export const createKernel = (logger) => new KernelRuntime(logger);
export const createContract = (contract) => contract;
//# sourceMappingURL=index.js.map