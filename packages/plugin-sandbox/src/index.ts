import vm from 'node:vm';
import type { PluginManifest, PluginPermission } from '@irp/plugin-sdk';
import { PermissionEngine, type Principal } from '@irp/security';
export class CapabilityViolation extends Error {
  constructor(message: string) {
    super(message);
  }
}
export class PluginSandbox {
  private readonly engine = new PermissionEngine();
  constructor(private readonly memoryLimitBytes = 128 * 1024 * 1024) {}
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
    const sandbox = vm.createContext(
      Object.freeze({ ...context, process: undefined, require: undefined, Buffer: undefined }),
    );
    const script = new vm.Script(code, { filename: manifest.entry });
    return script.runInContext(sandbox, { timeout: 1000, breakOnSigint: false }) as T;
  }
  measure(): { memoryBytes: number; cpuUserMicros: number } {
    const mem = process.memoryUsage().heapUsed;
    if (mem > this.memoryLimitBytes)
      throw new CapabilityViolation('Plugin runtime exceeded memory budget');
    return { memoryBytes: mem, cpuUserMicros: process.cpuUsage().user };
  }
}
