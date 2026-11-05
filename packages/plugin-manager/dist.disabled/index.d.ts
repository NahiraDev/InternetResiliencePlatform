import type { InternetResiliencePlugin, PluginManifest } from '@irp/plugin-sdk';
import { PluginRuntime } from '@irp/plugin-runtime';
export declare class PluginManager {
    readonly runtime: PluginRuntime;
    private readonly platformVersion;
    private readonly validator;
    private readonly resolver;
    constructor(runtime?: PluginRuntime, platformVersion?: string);
    installAll(plugins: InternetResiliencePlugin[]): Promise<void>;
    safeUpdate(plugin: InternetResiliencePlugin): Promise<void>;
    hotReload(id: string): Promise<void>;
    graph(): PluginManifest[];
}
export * from '@irp/plugin-runtime';
//# sourceMappingURL=index.d.ts.map