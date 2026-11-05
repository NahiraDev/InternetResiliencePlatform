import type { PluginHealth, PluginManifest, PluginStatus } from '@irp/plugin-sdk';
export interface RegistryRecord {
    manifest: PluginManifest;
    status: PluginStatus;
    installedAt: string;
    updatedAt: string;
    health: PluginHealth;
    checksum?: string;
    signature?: string;
}
export declare class PluginRegistry {
    private readonly records;
    install(manifest: PluginManifest): RegistryRecord;
    update(manifest: PluginManifest): RegistryRecord;
    setStatus(id: string, status: PluginStatus): void;
    setHealth(id: string, health: Partial<PluginHealth>): void;
    remove(id: string): void;
    get(id: string): RegistryRecord;
    find(id: string): RegistryRecord | undefined;
    list(): RegistryRecord[];
}
//# sourceMappingURL=index.d.ts.map