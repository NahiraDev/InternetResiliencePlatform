import vm from 'node:vm';
import { PermissionEngine } from '@irp/security';
export class CapabilityViolation extends Error {
    constructor(message) {
        super(message);
        this.name = 'CapabilityViolation';
    }
}
/**
 * In-process plugin execution is a containment aid, not a trust boundary.
 * Untrusted plugins must be executed by a process/container-level sandbox.
 */
export class PluginSandbox {
    memoryLimitBytes;
    engine = new PermissionEngine();
    constructor(memoryLimitBytes = 128 * 1024 * 1024) {
        this.memoryLimitBytes = memoryLimitBytes;
        if (!Number.isSafeInteger(memoryLimitBytes) || memoryLimitBytes <= 0)
            throw new RangeError('Plugin memory limit must be a positive safe integer.');
    }
    principal(manifest) {
        return {
            id: `plugin:${manifest.id}`,
            roles: ['Plugin'],
            permissions: manifest.permissions,
        };
    }
    assert(manifest, permission) {
        if (!manifest.permissions.includes(permission))
            throw new CapabilityViolation(`Plugin ${manifest.id} lacks ${permission}`);
        this.engine.assert(this.principal(manifest), []);
    }
    execute(manifest, code, context) {
        if (!manifest.entry)
            throw new CapabilityViolation('Plugin entry is required.');
        if (typeof code !== 'string' || code.length === 0)
            throw new CapabilityViolation('Plugin code must be a non-empty string.');
        const sandbox = vm.createContext(Object.freeze({
            ...context,
            process: undefined,
            require: undefined,
            module: undefined,
            exports: undefined,
            Buffer: undefined,
            global: undefined,
            globalThis: undefined,
        }), {
            name: `irp-plugin:${manifest.id}`,
            codeGeneration: { strings: false, wasm: false },
        });
        const script = new vm.Script(code, { filename: manifest.entry });
        return script.runInContext(sandbox, {
            timeout: 1000,
            breakOnSigint: false,
        });
    }
    measure() {
        const memoryBytes = process.memoryUsage().heapUsed;
        if (memoryBytes > this.memoryLimitBytes)
            throw new CapabilityViolation('Plugin runtime exceeded memory budget');
        return { memoryBytes, cpuUserMicros: process.cpuUsage().user };
    }
}
//# sourceMappingURL=index.js.map