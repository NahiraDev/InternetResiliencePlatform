import type {
  InternetResiliencePlugin,
  PluginContext,
  PluginHealth,
  PluginLogger,
  PluginManifest,
  PluginStatus,
} from '@irp/plugin-sdk';
import { createPluginApi } from '@irp/plugin-api';
import { PluginConfigStore } from '@irp/plugin-config';
import { PluginEventBus } from '@irp/plugin-events';
import { PluginRegistry } from '@irp/plugin-registry';
import { PluginSandbox } from '@irp/plugin-sandbox';
export class ConsolePluginLogger implements PluginLogger {
  constructor(private readonly id: string) {}
  debug(message: string, meta?: Record<string, unknown>): void {
    console.debug(this.id, message, meta ?? '');
  }
  info(message: string, meta?: Record<string, unknown>): void {
    console.info(this.id, message, meta ?? '');
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(this.id, message, meta ?? '');
  }
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(this.id, message, meta ?? '');
  }
}
export class PluginRuntime {
  private readonly instances = new Map<string, InternetResiliencePlugin>();
  private readonly started = new Map<string, number>();
  constructor(
    readonly registry = new PluginRegistry(),
    readonly events = new PluginEventBus(),
    readonly config = new PluginConfigStore(),
    readonly sandbox = new PluginSandbox(),
  ) {}
  context<T extends Record<string, unknown>>(manifest: PluginManifest): PluginContext<T> {
    const events = this.events;
    return {
      manifest,
      logger: new ConsolePluginLogger(manifest.id),
      events,
      config: this.config.api(
        manifest.id,
        manifest.configurationSchema,
      ) as PluginContext<T>['config'],
      api: createPluginApi(manifest, events),
      requirePermission: (p) => this.sandbox.assert(manifest, p),
    };
  }
  async install(plugin: InternetResiliencePlugin): Promise<void> {
    this.registry.install(plugin.manifest);
    await this.config.set(plugin.manifest.id, plugin.manifest.configurationSchema, {});
    await plugin.install?.(this.context(plugin.manifest));
    this.instances.set(plugin.manifest.id, plugin);
  }
  async validate(id: string): Promise<void> {
    const plugin = this.plugin(id);
    await plugin.validate?.(this.context(plugin.manifest));
    this.registry.setStatus(id, 'validated');
  }
  async load(id: string): Promise<void> {
    this.registry.setStatus(id, 'loaded');
  }
  async initialize(id: string): Promise<void> {
    const plugin = this.plugin(id);
    await plugin.initialize?.(this.context(plugin.manifest));
    this.registry.setStatus(id, 'initialized');
  }
  async activate(id: string): Promise<void> {
    const started = Date.now();
    const plugin = this.plugin(id);
    try {
      await plugin.activate?.(this.context(plugin.manifest));
      this.registry.setStatus(id, 'active');
      this.started.set(id, started);
      this.registry.setHealth(id, { activationTimeMs: Date.now() - started, status: 'healthy' });
      await this.events.publish('plugin.activated', { id });
    } catch (error) {
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
  async suspend(id: string): Promise<void> {
    const p = this.plugin(id);
    await p.suspend?.(this.context(p.manifest));
    this.registry.setStatus(id, 'suspended');
  }
  async resume(id: string): Promise<void> {
    const p = this.plugin(id);
    await p.resume?.(this.context(p.manifest));
    this.registry.setStatus(id, 'active');
  }
  async reload(id: string): Promise<void> {
    const previous = this.registry.get(id).status;
    try {
      const p = this.plugin(id);
      await p.reload?.(this.context(p.manifest));
      this.registry.setStatus(id, previous);
      await this.events.publish('plugin.reloaded', { id });
    } catch (error) {
      this.registry.setStatus(id, previous);
      throw error;
    }
  }
  async update(plugin: InternetResiliencePlugin): Promise<void> {
    const current = this.registry.find(plugin.manifest.id);
    if (!current) return this.install(plugin);
    const old = this.plugin(plugin.manifest.id);
    const migrated = await this.config.migrate(
      plugin,
      this.config.get(plugin.manifest.id),
      current.manifest.version,
      plugin.manifest.version,
    );
    await this.config.set(plugin.manifest.id, plugin.manifest.configurationSchema, migrated);
    await plugin.update?.(this.context(plugin.manifest), current.manifest.version);
    this.instances.set(plugin.manifest.id, plugin);
    this.registry.update(plugin.manifest);
    await old.destroy?.(this.context(old.manifest));
  }
  async disable(id: string): Promise<void> {
    const p = this.plugin(id);
    await p.disable?.(this.context(p.manifest));
    this.registry.setStatus(id, 'disabled');
  }
  async enable(id: string): Promise<void> {
    const p = this.plugin(id);
    await p.enable?.(this.context(p.manifest));
    this.registry.setStatus(id, 'installed');
  }
  async uninstall(id: string): Promise<void> {
    const p = this.plugin(id);
    await p.uninstall?.(this.context(p.manifest));
    this.instances.delete(id);
    this.registry.setStatus(id, 'uninstalled');
    this.registry.remove(id);
  }
  async destroy(id: string): Promise<void> {
    const p = this.plugin(id);
    await p.destroy?.(this.context(p.manifest));
    this.registry.setStatus(id, 'destroyed');
  }
  async health(id: string): Promise<PluginHealth> {
    const p = this.plugin(id);
    const measured = this.sandbox.measure();
    const partial = await p.health?.();
    this.registry.setHealth(id, { ...measured, ...partial });
    return this.registry.get(id).health;
  }
  status(id: string): PluginStatus {
    return this.registry.get(id).status;
  }
  plugin(id: string): InternetResiliencePlugin {
    const plugin = this.instances.get(id);
    if (!plugin) throw new Error(`Plugin not loaded: ${id}`);
    return plugin;
  }
}
