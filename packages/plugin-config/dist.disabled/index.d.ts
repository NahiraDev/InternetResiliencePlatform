import type { ConfigurationSchema, PluginConfigurationApi } from '@irp/plugin-sdk';
export declare class PluginConfigStore {
    private readonly values;
    private readonly secure;
    private readonly reloaders;
    defaults(schema?: ConfigurationSchema): Record<string, unknown>;
    validate(schema: ConfigurationSchema | undefined, value: Record<string, unknown>): void;
    set(id: string, schema: ConfigurationSchema | undefined, value: Record<string, unknown>): Promise<void>;
    get(id: string): Record<string, unknown>;
    api(id: string, schema?: ConfigurationSchema): PluginConfigurationApi;
    migrate(plugin: {
        migrateConfig?: (c: Record<string, unknown>, f: string, t: string) => Promise<Record<string, unknown>> | Record<string, unknown>;
    }, config: Record<string, unknown>, from: string, to: string): Promise<Record<string, unknown>> | Record<string, unknown>;
}
//# sourceMappingURL=index.d.ts.map