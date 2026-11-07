import { DependencyResolver, PluginManifestValidator, compareVersions } from '@irp/plugin-loader';
import { PluginRuntime } from '@irp/plugin-runtime';
export class PluginManager {
    runtime;
    platformVersion;
    validator = new PluginManifestValidator();
    resolver = new DependencyResolver();
    constructor(runtime = new PluginRuntime(), platformVersion = '0.1.0') {
        this.runtime = runtime;
        this.platformVersion = platformVersion;
    }
    async installAll(plugins) {
        const ordered = this.resolver.order(plugins.map((p) => p.manifest));
        for (const manifest of ordered) {
            this.validator.validate(manifest, this.platformVersion);
            const plugin = plugins.find((p) => p.manifest.id === manifest.id);
            if (!plugin)
                throw new Error(`Plugin implementation missing: ${manifest.id}`);
            await this.runtime.install(plugin);
            await this.runtime.validate(manifest.id);
            await this.runtime.load(manifest.id);
            await this.runtime.initialize(manifest.id);
            if (manifest.activationEvents.includes('onStartup'))
                await this.runtime.activate(manifest.id);
        }
    }
    async safeUpdate(plugin) {
        const current = this.runtime.registry.find(plugin.manifest.id);
        if (current && compareVersions(plugin.manifest.version, current.manifest.version) <= 0)
            throw new Error('Plugin update must increase version');
        this.validator.validate(plugin.manifest, this.platformVersion);
        await this.runtime.update(plugin);
    }
    async hotReload(id) {
        await this.runtime.suspend(id);
        await this.runtime.reload(id);
        await this.runtime.resume(id);
    }
    graph() {
        return this.resolver.order(this.runtime.registry.list().map((r) => r.manifest));
    }
}
export * from '@irp/plugin-runtime';
//# sourceMappingURL=index.js.map