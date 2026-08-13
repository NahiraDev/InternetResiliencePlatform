import { describe, expect, it } from 'vitest';
import { PluginManager } from './index.js';
import { builtinPlugins, SampleDnsProvider } from '@irp/plugin-samples';
import { BasePlugin, type PluginManifest } from '@irp/plugin-sdk';
class Dep extends BasePlugin {
  manifest: PluginManifest = {
    ...new SampleDnsProvider().manifest,
    id: 'dep.core',
    dependencies: [],
    activationEvents: [],
  };
}
class UsesDep extends BasePlugin {
  manifest: PluginManifest = {
    ...new SampleDnsProvider().manifest,
    id: 'dep.user',
    dependencies: [{ id: 'dep.core', version: '^1.0.0' }],
    activationEvents: [],
  };
}
describe('plugin manager lifecycle', () => {
  it('installs, activates, reloads, updates and uninstalls built-ins', async () => {
    const manager = new PluginManager();
    await manager.installAll(builtinPlugins());
    expect(manager.runtime.status('builtin.dns.provider')).toBe('active');
    await manager.hotReload('builtin.dns.provider');
    expect(manager.runtime.status('builtin.dns.provider')).toBe('active');
    const next = new SampleDnsProvider();
    next.manifest = { ...next.manifest, version: '1.1.0' };
    await manager.safeUpdate(next);
    expect(manager.runtime.registry.get(next.manifest.id).manifest.version).toBe('1.1.0');
    await manager.runtime.uninstall(next.manifest.id);
    expect(manager.runtime.registry.find(next.manifest.id)).toBeUndefined();
  });
  it('orders dependencies before dependents', async () => {
    const manager = new PluginManager();
    await manager.installAll([new UsesDep(), new Dep()]);
    expect(manager.graph().map((m) => m.id)).toEqual(['dep.core', 'dep.user']);
  });
});
