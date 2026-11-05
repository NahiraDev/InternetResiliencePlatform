import { createPluginApi } from '@irp/plugin-api';
import { PluginConfigStore } from '@irp/plugin-config';
import { PluginEventBus } from '@irp/plugin-events';
import { PluginRegistry } from '@irp/plugin-registry';
import { PluginSandbox } from '@irp/plugin-sandbox';
export class ConsolePluginLogger {
    id;
    constructor(id) {
        this.id = id;
    }
    debug(message, meta) {
        console.debug(this.id, message, meta ?? '');
    }
    info(message, meta) {
        console.info(this.id, message, meta ?? '');
    }
    warn(message, meta) {
        console.warn(this.id, message, meta ?? '');
    }
    error(message, meta) {
        console.error(this.id, message, meta ?? '');
    }
}
export class PluginRuntime {
    registry;
    events;
    config;
    sandbox;
    instances = new Map();
    started = new Map();
    constructor(registry = new PluginRegistry(), events = new PluginEventBus(), config = new PluginConfigStore(), sandbox = new PluginSandbox()) {
        this.registry = registry;
        this.events = events;
        this.config = config;
        this.sandbox = sandbox;
    }
    context(manifest) {
        const events = this.events;
        return {
            manifest,
            logger: new ConsolePluginLogger(manifest.id),
            events,
            config: this.config.api(manifest.id, manifest.configurationSchema),
            api: createPluginApi(manifest, events),
            requirePermission: (p) => this.sandbox.assert(manifest, p),
        };
    }
    async install(plugin) {
        this.registry.install(plugin.manifest);
        await this.config.set(plugin.manifest.id, plugin.manifest.configurationSchema, {});
        await plugin.install?.(this.context(plugin.manifest));
        this.instances.set(plugin.manifest.id, plugin);
    }
    async validate(id) {
        const plugin = this.plugin(id);
        await plugin.validate?.(this.context(plugin.manifest));
        this.registry.setStatus(id, 'validated');
    }
    async load(id) {
        this.registry.setStatus(id, 'loaded');
    }
    async initialize(id) {
        const plugin = this.plugin(id);
        await plugin.initialize?.(this.context(plugin.manifest));
        this.registry.setStatus(id, 'initialized');
    }
    async activate(id) {
        const started = Date.now();
        const plugin = this.plugin(id);
        try {
            await plugin.activate?.(this.context(plugin.manifest));
            this.registry.setStatus(id, 'active');
            this.started.set(id, started);
            this.registry.setHealth(id, { activationTimeMs: Date.now() - started, status: 'healthy' });
            await this.events.publish('plugin.activated', { id });
        }
        catch (error) {
            const current = this.registry.get(id).health;
            this.registry.setHealth(id, {
                status: 'unhealthy',
                crashCount: current.crashCount + 1,
                message: error instanceof Error ? error.message : 'activation failed',
            });
            this.registry.setStatus(id, 'failed');
            throw error;
        }
    }
    async suspend(id) {
        const p = this.plugin(id);
        await p.suspend?.(this.context(p.manifest));
        this.registry.setStatus(id, 'suspended');
    }
    async resume(id) {
        const p = this.plugin(id);
        await p.resume?.(this.context(p.manifest));
        this.registry.setStatus(id, 'active');
    }
    async reload(id) {
        const previous = this.registry.get(id).status;
        try {
            const p = this.plugin(id);
            await p.reload?.(this.context(p.manifest));
            this.registry.setStatus(id, previous);
            await this.events.publish('plugin.reloaded', { id });
        }
        catch (error) {
            this.registry.setStatus(id, previous);
            throw error;
        }
    }
    async update(plugin) {
        const current = this.registry.find(plugin.manifest.id);
        if (!current)
            return this.install(plugin);
        const old = this.plugin(plugin.manifest.id);
        const migrated = await this.config.migrate(plugin, this.config.get(plugin.manifest.id), current.manifest.version, plugin.manifest.version);
        await this.config.set(plugin.manifest.id, plugin.manifest.configurationSchema, migrated);
        await plugin.update?.(this.context(plugin.manifest), current.manifest.version);
        this.instances.set(plugin.manifest.id, plugin);
        this.registry.update(plugin.manifest);
        await old.destroy?.(this.context(old.manifest));
    }
    async disable(id) {
        const p = this.plugin(id);
        await p.disable?.(this.context(p.manifest));
        this.registry.setStatus(id, 'disabled');
    }
    async enable(id) {
        const p = this.plugin(id);
        await p.enable?.(this.context(p.manifest));
        this.registry.setStatus(id, 'installed');
    }
    async uninstall(id) {
        const p = this.plugin(id);
        await p.uninstall?.(this.context(p.manifest));
        this.instances.delete(id);
        this.registry.setStatus(id, 'uninstalled');
        this.registry.remove(id);
    }
    async destroy(id) {
        const p = this.plugin(id);
        await p.destroy?.(this.context(p.manifest));
        this.registry.setStatus(id, 'destroyed');
    }
    async health(id) {
        const p = this.plugin(id);
        const measured = this.sandbox.measure();
        const partial = await p.health?.();
        this.registry.setHealth(id, { ...measured, ...partial });
        return this.registry.get(id).health;
    }
    status(id) {
        return this.registry.get(id).status;
    }
    plugin(id) {
        const plugin = this.instances.get(id);
        if (!plugin)
            throw new Error(`Plugin not loaded: ${id}`);
        return plugin;
    }
}
//# sourceMappingURL=index.js.map