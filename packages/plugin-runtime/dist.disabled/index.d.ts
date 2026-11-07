import type { InternetResiliencePlugin, PluginContext, PluginHealth, PluginLogger, PluginManifest, PluginStatus } from '@irp/plugin-sdk';
import { PluginConfigStore } from '@irp/plugin-config';
import { PluginEventBus } from '@irp/plugin-events';
import { PluginRegistry } from '@irp/plugin-registry';
import { PluginSandbox } from '@irp/plugin-sandbox';
export declare class ConsolePluginLogger implements PluginLogger {
    private readonly id;
    constructor(id: string);
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
}
export declare class PluginRuntime {
    readonly registry: PluginRegistry;
    readonly events: PluginEventBus;
    readonly config: PluginConfigStore;
    readonly sandbox: PluginSandbox;
    private readonly instances;
    private readonly started;
    constructor(registry?: PluginRegistry, events?: PluginEventBus, config?: PluginConfigStore, sandbox?: PluginSandbox);
    context<T extends Record<string, unknown>>(manifest: PluginManifest): PluginContext<T>;
    install(plugin: InternetResiliencePlugin): Promise<void>;
    validate(id: string): Promise<void>;
    load(id: string): Promise<void>;
    initialize(id: string): Promise<void>;
    activate(id: string): Promise<void>;
    suspend(id: string): Promise<void>;
    resume(id: string): Promise<void>;
    reload(id: string): Promise<void>;
    update(plugin: InternetResiliencePlugin): Promise<void>;
    disable(id: string): Promise<void>;
    enable(id: string): Promise<void>;
    uninstall(id: string): Promise<void>;
    destroy(id: string): Promise<void>;
    health(id: string): Promise<PluginHealth>;
    status(id: string): PluginStatus;
    plugin(id: string): InternetResiliencePlugin;
}
//# sourceMappingURL=index.d.ts.map