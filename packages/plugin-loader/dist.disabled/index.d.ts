import type { InternetResiliencePlugin, PluginManifest } from '@irp/plugin-sdk';
export declare class PluginManifestValidator {
    validate(manifest: PluginManifest, platformVersion?: string): void;
    checksum(content: string | Buffer): string;
    validateChecksum(manifest: PluginManifest, content: string | Buffer): void;
}
export declare const compareVersions: (a: string, b: string) => number;
export declare class DependencyResolver {
    order(manifests: PluginManifest[]): PluginManifest[];
}
export declare const satisfies: (version: string, range: string) => boolean;
export declare class PluginDiscovery {
    private readonly directories;
    constructor(directories: string[]);
    discover(): Promise<string[]>;
    loadManifest(file: string): Promise<PluginManifest>;
}
export type PluginFactory = () => InternetResiliencePlugin | Promise<InternetResiliencePlugin>;
//# sourceMappingURL=index.d.ts.map