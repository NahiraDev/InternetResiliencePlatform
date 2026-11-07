import type { CapabilityApi, PluginApi, PluginEventApi, PluginManifest, PluginPermission } from '@irp/plugin-sdk';
export declare class SecureCapabilityApi implements CapabilityApi {
    readonly name: string;
    private readonly manifest;
    private readonly required;
    private readonly operations;
    constructor(name: string, manifest: PluginManifest, required: PluginPermission, operations?: Map<string, (input: unknown) => Promise<unknown> | unknown>);
    call<T = unknown>(operation: string, input?: unknown): Promise<T>;
    register(operation: string, handler: (input: unknown) => Promise<unknown> | unknown): void;
}
export declare const createPluginApi: (manifest: PluginManifest, events: PluginEventApi) => PluginApi;
//# sourceMappingURL=index.d.ts.map