import { BasePlugin, type PluginManifest } from '@irp/plugin-sdk';
export declare class SampleDnsProvider extends BasePlugin {
    manifest: PluginManifest;
    activate(): Promise<void>;
}
export declare class SampleVpnProvider extends BasePlugin {
    manifest: PluginManifest;
}
export declare class SampleNotificationProvider extends BasePlugin {
    manifest: PluginManifest;
}
export declare class SampleMetricsExporter extends BasePlugin {
    manifest: PluginManifest;
}
export declare class SampleHealthChecker extends BasePlugin {
    manifest: PluginManifest;
}
export declare const builtinPlugins: () => (SampleDnsProvider | SampleVpnProvider | SampleNotificationProvider | SampleMetricsExporter | SampleHealthChecker)[];
//# sourceMappingURL=index.d.ts.map