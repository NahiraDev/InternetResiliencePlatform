import vm from 'node:vm';
import type { PluginManifest, PluginPermission } from '@irp/plugin-sdk';
import { PermissionEngine, type Principal } from '@irp/security';

export class CapabilityViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityViolation';
  }
}

/**
 * In-process plugin execution is a containment aid, not a trust boundary.
 * Untrusted plugins must be executed by a process/container-level sandbox.
 */
export class PluginSandbox {
  private readonly engine = new PermissionEngine();

  constructor(private readonly memoryLimitBytes = 128 * 1024 * 1024) {
    if (!Number.isSafeInteger(memoryLimitBytes) || memoryLimitBytes <= 0)
      throw new RangeError('Plugin memory limit must be a positive safe integer.');
  }

  principal(manifest: PluginManifest): Principal {
    return {
      id: `plugin:${manifest.id}`,
      roles: ['Plugin'],
      permissions: manifest.permissions as never[],
    };
  }

  assert(manifest: PluginManifest, permission: PluginPermission): void {
    if (!manifest.permissions.includes(permission))
      throw new CapabilityViolation(`Plugin ${manifest.id} lacks ${permission}`);
    this.engine.assert(this.principal(manifest), []);
  }

  execute<T>(manifest: PluginManifest, code: string, context: Record<string, unknown>): T {
    if (!manifest.entry) throw new CapabilityViolation('Plugin entry is required.');
    if (typeof code !== 'string' || code.length === 0)
      throw new CapabilityViolation('Plugin code must be a non-empty string.');

    const sandbox = vm.createContext(
      Object.freeze({
        ...context,
        process: undefined,
        require: undefined,
        module: undefined,
        exports: undefined,
        Buffer: undefined,
        global: undefined,
        globalThis: undefined,
      }),
      {
        name: `irp-plugin:${manifest.id}`,
        codeGeneration: { strings: false, wasm: false },
      },
    );
    const script = new vm.Script(code, { filename: manifest.entry });
    return script.runInContext(sandbox, {
      timeout: 1000,
      breakOnSigint: false,
    }) as T;
  }

  measure(): { memoryBytes: number; cpuUserMicros: number } {
    const memoryBytes = process.memoryUsage().heapUsed;
    if (memoryBytes > this.memoryLimitBytes)
      throw new CapabilityViolation('Plugin runtime exceeded memory budget');
    return { memoryBytes, cpuUserMicros: process.cpuUsage().user };
  }
}
