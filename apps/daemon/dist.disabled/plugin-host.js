import { PluginManager } from '@irp/plugin-manager';
export class PluginHost {
    manager;
    plugins;
    running = false;
    constructor(plugins = []) {
        this.plugins = [...plugins];
        this.manager = new PluginManager();
    }
    async start() {
        if (this.running)
            return;
        await this.manager.installAll(this.plugins);
        this.running = true;
    }
    async stop() {
        if (!this.running)
            return;
        for (const entry of this.manager.runtime.registry.list()) {
            if (entry.status === 'active' && entry.manifest.activationEvents.includes('onStartup')) {
                try {
                    await this.manager.runtime.suspend(entry.manifest.id);
                }
                catch {
                    // best-effort shutdown
                }
            }
        }
        this.running = false;
    }
    get isRunning() {
        return this.running;
    }
    status() {
        if (!this.running)
            return { loaded: [], active: [] };
        const registrations = this.manager.runtime.registry.list();
        return {
            loaded: registrations.map((entry) => entry.manifest.id),
            active: registrations
                .filter((entry) => entry.status === 'active')
                .map((entry) => entry.manifest.id),
        };
    }
}
//# sourceMappingURL=plugin-host.js.map