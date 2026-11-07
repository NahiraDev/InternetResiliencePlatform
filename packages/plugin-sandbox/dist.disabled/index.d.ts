import type { PluginManifest, PluginPermission } from '@irp/plugin-sdk';
import { type Principal } from '@irp/security';
export declare class CapabilityViolation extends Error {
    constructor(message: string);
}
/**
 * In-process plugin execution is a containment aid, not a trust boundary.
 * Untrusted plugins must be executed by a process/container-level sandbox.
 */
export declare class PluginSandbox {
    private readonly memoryLimitBytes;
    private readonly engine;
    constructor(memoryLimitBytes?: number);
    principal(manifest: PluginManifest): Principal;
    assert(manifest: PluginManifest, permission: PluginPermission): void;
    execute<T>(manifest: PluginManifest, code: string, context: Record<string, unknown>): T;
    measure(): {
        memoryBytes: number;
        cpuUserMicros: number;
    };
}
//# sourceMappingURL=index.d.ts.map