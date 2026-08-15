import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  BasePlugin,
  definePlugin,
  type PluginContext,
  type PluginManifest,
  type PluginPermission,
} from './index.js';

const manifest: PluginManifest = {
  id: 'sdk.plugin',
  name: 'sdk-plugin',
  displayName: 'SDK Plugin',
  version: '1.0.0',
  description: 'test',
  author: 'IRP',
  license: 'Apache-2.0',
  engineVersion: '^0.1.0',
  minimumPlatformVersion: '0.1.0',
  permissions: ['network.read'],
  dependencies: [],
  optionalDependencies: [],
  entry: 'dist/index.js',
  activationEvents: ['onStartup'],
  capabilities: ['network-analyzer'],
};
class TestPlugin extends BasePlugin {
  manifest = manifest;
}

describe('plugin SDK contracts', () => {
  it('definePlugin preserves plugin lifecycle shape', () => {
    const plugin = definePlugin(new TestPlugin());
    expect(plugin.manifest.id).toBe('sdk.plugin');
  });
  it('BasePlugin stores context and emits health/log behavior through the public lifecycle', () => {
    const plugin = new TestPlugin();
    const info = vi.fn();
    plugin.initialize({
      manifest,
      logger: { debug() {}, info, warn() {}, error() {} },
      events: {} as never,
      config: {} as never,
      api: {} as never,
      requirePermission() {},
    } satisfies PluginContext);
    expect(plugin.health()).toMatchObject({ status: 'healthy', message: 'sdk.plugin ready' });
  });
  it('keeps permission and manifest contracts compile-time compatible', () => {
    expectTypeOf<'network.read'>().toExtend<PluginPermission>();
    expectTypeOf(manifest.permissions).toEqualTypeOf<PluginPermission[]>();
  });
});
